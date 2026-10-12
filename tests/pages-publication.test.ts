import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { fixture } from "./helpers/admin-fixture.ts";
import { cloudflareClient, digest, records, publicationStatements, publishPages, verifyPublishedForm, withoutPagesAnalytics,
  type Deployment, type Publication, type PublicationIO, type Statement } from "../scripts/pages-publication.ts";

const ORIGINS = ["https://public.sorane.example", "https://alias.sorane.example"];
const FORM = '<form data-sorane-contact action="/_contact"></form>';
const COMMIT = "a".repeat(40);
const deployment = (id = randomUUID()): Deployment => ({ id, url: `https://${id.slice(0, 8)}.sorane.pages.dev`,
  environment: "production", latest_stage: { status: "success" }, deployment_trigger: { metadata: { branch: "main", commit_hash: COMMIT } } });

test("Pages release coordinator preserves atomic policies and recovers failed releases", async t => {
  const bundle = await build({ entryPoints: [new URL("../packages/public-worker/src/pages-contact.ts", import.meta.url).pathname],
    bundle: true, write: false, format: "esm", platform: "node", target: "es2023" });
  const f = await fixture(t, { adminMode: "inquiries", engine: "e".repeat(64), bucket: "unused", workers: [{
    name: "pages-contact", routes: ORIGINS.map(origin => origin + "/*"), modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-10-10", compatibilityFlags: ["nodejs_compat", "disallow_importable_env"],
    d1Databases: { DB: "pipeline-db" }, bindings: { CONTACT_SITE_ID: "pages", CONTACT_ORIGINS: JSON.stringify(ORIGINS) },
  }] });
  await f.seedSite("pages", { owner: "owner" });
  const worker = await f.mf.getWorker("pages-contact");
  const query = async (batch: Statement[]) => (await f.db.batch(batch.map(s => s.params?.length ? f.db.prepare(s.sql).bind(...s.params) : f.db.prepare(s.sql))))
    .map(result => result.results as Record<string, unknown>[]);
  const state = async () => (await query([{ sql: "SELECT * FROM pages_contact_publication ORDER BY origin" }]))[0] as Publication[];
  const count = async () => await f.db.prepare("SELECT COUNT(*) AS n FROM pages_contact_event").first<number>("n");
  const payload = { request_id: randomUUID(), email: "test@example.test", subject: "Release test", body: "Synthetic inquiry", consent: true };
  const send = (origin = ORIGINS[0]) => worker.fetch(origin + "/_contact", { method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  let old: Deployment, next: Deployment, current: Deployment, calls: string[], io: PublicationIO;
  const plan = { site: "pages", origins: ORIGINS, actor: "test-operator", commit: COMMIT, formDigest: digest(FORM), enabled: true };
  async function reset() {
    await query([{ sql: "DELETE FROM pages_contact_publication" }, { sql: "DELETE FROM pages_contact_event" },
      { sql: "INSERT OR IGNORE INTO site_member VALUES('pages','owner','owner')" }]);
    old = deployment(); next = deployment(); current = old; calls = [];
    await query(publicationStatements(records(plan, old.id), plan.actor, "Reviewed baseline"));
    io = { query, current: async () => current, deployment: async id => id === next.id ? next : old,
      deploy: async created => { calls.push("deploy"); assert.ok((await state()).every(p => !p.enabled), "API paused before upload");
        assert.equal((await send()).status, 404); current = next; created(next.id); return next.id; },
      rollback: async id => { calls.push("rollback:" + id); assert.ok((await state()).every(p => !p.enabled)); current = id === old.id ? old : next; },
      verify: async (d, policies) => { calls.push("verify:" + d.id); assert.ok((await state()).every(p => !p.enabled), "verify before activation");
        assert.ok(policies.every(p => p.deployment_id === d.id)); },
    };
  }

  await t.test("successful deployment resumes both origins and keeps retries idempotent", async () => {
    await reset();
    const created = await send(); assert.equal(created.status, 201); const receipt = await created.json();
    const result = await publishPages(io, plan); assert.equal(result.ok, true);
    assert.ok((await state()).every(p => p.enabled === 1 && p.deployment_id === next.id));
    assert.equal(await count(), 6, "baseline, pause and publish are audited for both origins");
    const retry = await send(); assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), receipt);
    assert.equal((await send(ORIGINS[1])).status, 200, "retry identity is scoped to the site");
    const owner = await f.login("owner");
    const inbox = await owner.get("/api/sites/pages/inquiries");
    assert.equal((await inbox.json() as any).inquiries.length, 1, "release did not duplicate the inquiry");
  });
  await t.test("form removal disables reception before deploying and leaves it disabled", async () => {
    await reset(); const result = await publishPages(io, { ...plan, enabled: false, formDigest: digest("") });
    assert.equal(result.ok, true); assert.equal(result.contact_enabled, false);
    assert.ok((await state()).every(p => p.enabled === 0 && p.deployment_id === next.id));
    assert.equal((await send()).status, 404);
  });
  await t.test("upload failure restores the previous API with a new audit", async () => {
    await reset(); io.deploy = async () => { throw new Error("sensitive transport error"); };
    const result = await publishPages(io, plan); assert.equal(result.recovery, "restored"); assert.equal(result.phase, "deploy");
    assert.ok((await state()).every(p => p.enabled && p.deployment_id === old.id));
    assert.equal(await count(), 6); assert.ok(!calls.some(s => s.startsWith("rollback:")));
    assert.doesNotMatch(JSON.stringify(result), /sensitive/);
  });
  await t.test("failed activation rolls back this deployment and restores both policies", async () => {
    await reset(); let fail = true;
    io.query = async batch => {
      if (fail && batch.some(s => s.sql.includes("publish: Verified"))) { fail = false; throw new Error("D1 unavailable"); }
      return query(batch);
    };
    const result = await publishPages(io, plan); assert.equal(result.recovery, "restored"); assert.equal(current.id, old.id);
    assert.ok(calls.includes("rollback:" + old.id)); assert.ok((await state()).every(p => p.enabled && p.deployment_id === old.id));
  });
  await t.test("lost activation response also disables, rolls back and recovers", async () => {
    await reset(); let fail = true;
    io.query = async batch => { const result = await query(batch);
      if (fail && batch.some(s => s.sql.includes("publish: Verified"))) { fail = false; throw new Error("response lost after commit"); }
      return result;
    };
    assert.equal((await publishPages(io, plan)).recovery, "restored");
    assert.equal(current.id, old.id); assert.ok((await state()).every(p => p.enabled && p.deployment_id === old.id));
  });
  await t.test("owner removal during deployment cannot reactivate either origin", async () => {
    await reset(); const upload = io.deploy;
    io.deploy = async created => { const id = await upload(created); await query([{ sql: "DELETE FROM site_member WHERE role='owner'" }]); return id; };
    const result = await publishPages(io, plan); assert.equal(result.ok, false); assert.equal(result.recovery, "manual_review_required");
    assert.equal(current.id, old.id); assert.ok((await state()).every(p => !p.enabled));
    assert.equal(await count(), 4, "failed activation and restoration leave no partial audits");
    assert.equal((await send()).status, 404);
  });
  await t.test("missing owner and preview target are refused before pause", async () => {
    await reset(); await query([{ sql: "DELETE FROM site_member WHERE role='owner'" }]);
    assert.equal((await publishPages(io, plan)).recovery, "unchanged"); assert.equal(await count(), 2); assert.deepEqual(calls, []);
    await reset(); next.environment = "preview";
    assert.equal((await publishPages(io, { ...plan, rollback: next.id })).recovery, "unchanged"); assert.equal(await count(), 2);
  });
  await t.test("foreign production deployment is not overwritten or rolled back", async () => {
    await reset(); const foreign = deployment(); const upload = io.deploy;
    io.deploy = async created => { const id = await upload(created); current = foreign; return id; };
    assert.equal((await publishPages(io, plan)).recovery, "manual_review_required");
    assert.equal(current.id, foreign.id); assert.ok((await state()).every(p => !p.enabled));
    assert.ok(!calls.some(s => s.startsWith("rollback:")));
  });
  await t.test("a foreign deployment appearing after activation leaves this policy disabled", async () => {
    await reset(); const foreign = deployment();
    io.query = async batch => { const result = await query(batch);
      if (batch.some(s => s.sql.includes("publish: Verified"))) current = foreign;
      return result;
    };
    assert.equal((await publishPages(io, plan)).recovery, "manual_review_required");
    assert.equal(current.id, foreign.id); assert.ok((await state()).every(p => !p.enabled));
    assert.ok(!calls.some(s => s.startsWith("rollback:")));
  });
  await t.test("wrong uploaded source and failed HTML verification both restore the previous release", async () => {
    await reset(); next.deployment_trigger.metadata.commit_hash = "b".repeat(40);
    assert.equal((await publishPages(io, plan)).code, "wrong_source_commit"); assert.equal(current.id, old.id);
    await reset(); const verify = io.verify;
    io.verify = async (d, policies) => { if (d.id === next.id) throw new Error("published_form_mismatch"); await verify(d, policies); };
    const result = await publishPages(io, plan); assert.equal(result.code, "published_form_mismatch"); assert.equal(result.recovery, "restored");
    assert.ok((await state()).every(p => p.enabled && p.deployment_id === old.id));
  });
  await t.test("another operator's policy update aborts the entire multi-origin transaction", async () => {
    await reset(); const baseline = await state(); const before = await count();
    const changed = records({ ...plan, origins: [ORIGINS[1]] }, old.id);
    await query(publicationStatements(changed, "another-operator", "Reviewed update", baseline.filter(p => p.origin === ORIGINS[1])));
    const afterOtherOperator = await state();
    await assert.rejects(query(publicationStatements(records(plan, next.id), plan.actor, "publish: stale transition", baseline)), /NOT NULL/);
    assert.equal(await count(), before! + 1); assert.deepEqual(await state(), afterOtherOperator);
  });
  await t.test("rollback restores the audited enabled setting, ignoring temporary pause events", async () => {
    await reset(); assert.equal((await publishPages(io, { ...plan, enabled: false })).ok, true);
    assert.equal((await publishPages(io, { ...plan, rollback: old.id })).ok, true);
    assert.equal(current.id, old.id); assert.ok((await state()).every(p => p.enabled && p.deployment_id === old.id));
  });
  await t.test("rollback to a disabled deployment keeps reception off", async () => {
    await reset(); await query(publicationStatements(records({ ...plan, enabled: false }, old.id), plan.actor, "Reviewed disabled build", await state()));
    assert.equal((await publishPages(io, plan)).ok, true);
    assert.equal((await publishPages(io, { ...plan, rollback: old.id })).ok, true);
    assert.ok((await state()).every(p => !p.enabled && p.deployment_id === old.id));
  });
  await t.test("unknown rollback target fails before changing Pages or policies", async () => {
    await reset(); assert.equal((await publishPages(io, { ...plan, rollback: next.id })).recovery, "unchanged");
    assert.equal(await count(), 2); assert.deepEqual(calls, []);
  });
  await t.test("external rollback is reconciled only against an audited deployment", async () => {
    await reset(); assert.equal((await publishPages(io, plan)).ok, true); current = old;
    assert.equal((await publishPages(io, plan)).recovery, "unchanged", "ordinary deploy refuses stale policy");
    assert.equal((await publishPages(io, { ...plan, syncCurrent: true })).ok, true);
    assert.ok((await state()).every(p => p.enabled && p.deployment_id === old.id));
  });
  await t.test("explicit rollback also recovers a half-finished deployment with stale pointers", async () => {
    await reset(); current = next;
    assert.equal((await publishPages(io, { ...plan, rollback: old.id })).ok, true);
    assert.equal(current.id, old.id); assert.ok((await state()).every(p => p.enabled && p.deployment_id === old.id));
  });
});

test("Cloudflare transport uses an atomic D1 batch and sanitizes API errors", async () => {
  const token = "never-print-this-token", account = "a".repeat(32), database = randomUUID();
  const client = cloudflareClient(token, account, database, async (url, init) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`);
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    assert.deepEqual(JSON.parse(String(init?.body)), { batch: [{ sql: "SELECT 1", params: [] }] });
    return Response.json({ success: true, result: [{ success: true, results: [{ n: 1 }] }] });
  });
  assert.deepEqual(await client.query([{ sql: "SELECT 1", params: [] }]), [[{ n: 1 }]]);
  for (const fail of [async () => { throw new Error(token); }, async () => Response.json({ success: false, errors: [{ message: token }] }, { status: 403 })]) {
    const denied = cloudflareClient(token, account, database, fail);
    await assert.rejects(denied.current(), error => { assert.equal(String(error), "Error: cloudflare_request_failed"); return true; });
  }
});

test("immutable build and both production origins must match, ignoring only Pages analytics", async () => {
  const d = deployment(), policies = records({ site: "pages", origins: ORIGINS, formDigest: digest(FORM), enabled: true }, d.id);
  const injected = FORM + '<script defer src="https://static.cloudflareinsights.com/beacon.min.js/x" data-cf-beacon="test"></script>';
  assert.equal(withoutPagesAnalytics(injected), FORM);
  assert.notEqual(withoutPagesAnalytics(FORM + '<script src="https://another.example/beacon.min.js"></script>'), FORM);
  const urls: string[] = [];
  await verifyPublishedForm(d, policies, async url => { urls.push(String(url)); return new Response(injected); });
  assert.deepEqual(urls, [d.url + "/contact.html", ...ORIGINS.map(origin => origin + "/contact.html")]);
  const missing = records({ site: "pages", origins: ORIGINS, formDigest: digest(""), enabled: false }, d.id);
  await verifyPublishedForm(d, missing, async () => new Response("Not found", { status: 404 }));
});

test("a stale alias cannot activate the new publication even when the immutable URL matches", async () => {
  const d = deployment(), policies = records({ site: "pages", origins: ORIGINS, formDigest: digest(FORM), enabled: true }, d.id);
  await assert.rejects(verifyPublishedForm(d, policies, async url => new Response(String(url).startsWith(ORIGINS[1]) ? "Older HTML" : FORM)),
    /published_form_mismatch/);
});
