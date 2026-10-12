import { createHash, randomUUID } from "node:crypto";

export type Statement = { sql: string; params?: (string | number)[] };
export type Deployment = {
  id: string; url: string; environment: string;
  latest_stage: { status: string };
  deployment_trigger: { metadata: { branch: string; commit_hash: string } };
};
export type Publication = {
  origin: string; site_id: string; event_id: string; deployment_id: string;
  form_digest: string; policy_digest: string; enabled: number;
};
export type PublicationIO = {
  query: (statements: Statement[]) => Promise<Record<string, unknown>[][]>;
  current: () => Promise<Deployment>;
  deployment: (id: string) => Promise<Deployment>;
  deploy: (onCreated: (id: string) => void) => Promise<string>;
  rollback: (id: string) => Promise<void>;
  verify: (deployment: Deployment, publication: Publication[]) => Promise<void>;
};
export type PublicationPlan = {
  site: string; origins: string[]; actor: string; commit: string;
  formDigest: string; enabled: boolean;
  rollback?: string; syncCurrent?: boolean;
};
export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const formPresent = (html: string) => /<form\b[^>]*data-sorane-contact\b[^>]*action="\/_contact"/.test(html);
// Pages injects this analytics script after the uploaded HTML has been hashed.
// No other HTML changes are ignored.
export const withoutPagesAnalytics = (html: string) => html.replace(
  /<script\b(?=[^>]*\bsrc="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js[^\"]*")[^>]*><\/script>/g, "",
);
export function withoutPagesTransforms(html: string) {
  return withoutPagesAnalytics(html).replace(/<script>[\s\S]*?<\/script>/g, script => {
    // Bot Management adds this reviewed bootstrap on custom domains, with a
    // fresh ray and timestamp. Pin its entire remaining source: a script that
    // merely mentions Cloudflare, or contains extra code, must still fail.
    const canonical = script.replace(/window\.__CF\$cv\$params=\{r:'[a-f0-9]{16}',t:'[A-Za-z0-9+/=]+'\};/g,
      () => "window.__CF$cv$params={r:'RAY',t:'TIME'};");
    return digest(canonical) === "016660f3823e7f69cbe84c7b6e6e3219103232ab0ac3cf4094bb7a48cfffef36" ? "" : script;
  });
}

export function policyDigest(site: string, origin: string, deployment: string, formDigest: string, enabled: number) {
  return digest(JSON.stringify({ site, origin, deployment, formDigest, enabled }));
}

export function records(plan: Pick<PublicationPlan, "site" | "origins" | "formDigest" | "enabled">, deployment: string): Publication[] {
  return plan.origins.map(origin => ({ origin, site_id: plan.site, event_id: randomUUID(), deployment_id: deployment,
    form_digest: plan.formDigest, enabled: Number(plan.enabled),
    policy_digest: policyDigest(plan.site, origin, deployment, plan.formDigest, Number(plan.enabled)) }));
}

function validate(records: Publication[], site: string, origins: string[]) {
  if (records.length !== origins.length || new Set(records.map(p => p.origin)).size !== origins.length ||
    records.some(p => !origins.includes(p.origin) || p.site_id !== site || !UUID.test(p.event_id) ||
      !UUID.test(p.deployment_id) || !SHA.test(p.form_digest) || ![0, 1].includes(p.enabled) ||
      p.policy_digest !== policyDigest(site, p.origin, p.deployment_id, p.form_digest, p.enabled)))
    throw new Error("invalid_publication");
}

export function publicationStatements(next: Publication[], actor: string, reason: string, expected?: Publication[]): Statement[] {
  if (!next.length || !actor || actor.length > 255 || !reason || reason.length > 1000 ||
    /[\x00-\x1f\x7f]/.test(actor + reason)) throw new Error("invalid_audit");
  validate(next, next[0].site_id, next.map(p => p.origin));
  if (expected) validate(expected, next[0].site_id, next.map(p => p.origin));
  // Check every origin before changing any of them. D1 executes the entire batch
  // atomically; a stale publication or revoked owner aborts the audit and pointers.
  const guard = expected ? expected.map(p => `EXISTS(SELECT 1 FROM pages_contact_publication WHERE origin=${quote(p.origin)} AND site_id=${quote(p.site_id)} AND event_id=${quote(p.event_id)})`).join(" AND ") : "1";
  const statements: Statement[] = [];
  for (const [index, p] of next.entries()) {
    const owner = p.enabled === 0 ? "1" : `EXISTS(SELECT 1 FROM site_member WHERE site_id=${quote(p.site_id)} AND role='owner')`;
    statements.push({ sql: `INSERT INTO pages_contact_event(id,site_id,origin,deployment_id,form_digest,policy_digest,enabled,actor,reason,created_at)
VALUES(${quote(p.event_id)},${quote(p.site_id)},${quote(p.origin)},${quote(p.deployment_id)},${quote(p.form_digest)},${quote(p.policy_digest)},${p.enabled},${quote(actor)},${quote(reason)},
CASE WHEN ${owner} AND ${index === 0 ? guard : "1"} THEN unixepoch() ELSE NULL END)` });
    statements.push({ sql: `INSERT INTO pages_contact_publication(origin,site_id,event_id,deployment_id,form_digest,policy_digest,enabled,published_at)
VALUES(${quote(p.origin)},${quote(p.site_id)},${quote(p.event_id)},${quote(p.deployment_id)},${quote(p.form_digest)},${quote(p.policy_digest)},${p.enabled},unixepoch())
ON CONFLICT(origin) DO UPDATE SET site_id=excluded.site_id,event_id=excluded.event_id,deployment_id=excluded.deployment_id,
form_digest=excluded.form_digest,policy_digest=excluded.policy_digest,enabled=excluded.enabled,published_at=excluded.published_at` });
  }
  return statements;
}

function production(d: Deployment) {
  if (!UUID.test(d.id) || d.environment !== "production" || d.latest_stage?.status !== "success" ||
    d.deployment_trigger?.metadata?.branch !== "main" || d.url !== `https://${d.id.slice(0, 8)}.sorane.pages.dev`)
    throw new Error("invalid_production_deployment");
}

async function readPolicies(io: PublicationIO, plan: PublicationPlan): Promise<Publication[]> {
  const result = await io.query([{ sql: "SELECT * FROM pages_contact_publication WHERE site_id=?", params: [plan.site] }]);
  const rows = result[0] as Publication[];
  validate(rows, plan.site, plan.origins);
  return rows;
}

async function history(io: PublicationIO, plan: PublicationPlan, deployment: string): Promise<Publication[]> {
  const result = await io.query(plan.origins.map(origin => ({
    sql: `SELECT origin,site_id,id AS event_id,deployment_id,form_digest,policy_digest,enabled FROM pages_contact_event
WHERE site_id=? AND origin=? AND deployment_id=? AND reason NOT LIKE 'pause:%' ORDER BY created_at DESC,rowid DESC LIMIT 1`,
    params: [plan.site, origin, deployment],
  })));
  const rows = result.flat() as Publication[];
  validate(rows, plan.site, plan.origins);
  return rows;
}

const same = (a: Publication[], b: Publication[]) => a.length === b.length && a.every(p => b.some(q => q.origin === p.origin && q.event_id === p.event_id));
const renew = (rows: Publication[], enabled?: number) => rows.map(p => ({ ...p, event_id: randomUUID(), enabled: enabled ?? p.enabled,
  policy_digest: policyDigest(p.site_id, p.origin, p.deployment_id, p.form_digest, enabled ?? p.enabled) }));

export async function publishPages(io: PublicationIO, plan: PublicationPlan) {
  let phase = "preflight", previous: Deployment | undefined, baseline: Publication[] | undefined;
  let ownDeployment: string | undefined, paused = false;
  const known: Publication[][] = [];
  const write = async (next: Publication[], expected: Publication[], reason: string) => {
    known.push(next); // A lost response may still have committed this transaction.
    await io.query(publicationStatements(next, plan.actor, reason, expected));
  };
  try {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(plan.site) || !SHA.test(plan.formDigest) ||
      !plan.actor || plan.actor.length > 255 || /[\x00-\x1f\x7f]/.test(plan.actor) ||
      !/^[0-9a-f]{40}$/.test(plan.commit) || !plan.origins.length || plan.origins.length > 8 ||
      new Set(plan.origins).size !== plan.origins.length || plan.origins.some(origin => new URL(origin).origin !== origin || !origin.startsWith("https://")) ||
      (plan.rollback && (!UUID.test(plan.rollback) || plan.syncCurrent))) throw new Error("invalid_plan");
    previous = await io.current(); production(previous);
    baseline = await readPolicies(io, plan); known.push(baseline);
    if (!plan.syncCurrent && !plan.rollback && baseline.some(p => p.deployment_id !== previous!.id)) throw new Error("publication_out_of_sync");
    let target: Deployment | undefined, next: Publication[] | undefined;
    if (plan.rollback || plan.syncCurrent) {
      target = plan.syncCurrent ? previous : await io.deployment(plan.rollback!); production(target);
      next = renew(await history(io, plan, target.id));
    }
    const owner = await io.query([{ sql: "SELECT COUNT(*) AS n FROM site_member WHERE site_id=? AND role='owner'", params: [plan.site] }]);
    if ((next?.some(p => p.enabled) ?? plan.enabled) && Number(owner[0][0]?.n) === 0) throw new Error("owner_required");
    phase = "pause";
    const suspended = renew(baseline, 0);
    paused = true;
    await write(suspended, baseline, "pause: Pages publication transition");
    // Recheck immediately before the external mutation. A foreign release is
    // never rolled back or granted this run's contact policy.
    if ((await io.current()).id !== previous.id) throw new Error("concurrent_deployment");
    phase = plan.rollback ? "rollback" : plan.syncCurrent ? "sync" : "deploy";
    if (plan.rollback) {
      ownDeployment = target!.id;
      await io.rollback(ownDeployment);
    } else if (!plan.syncCurrent) {
      ownDeployment = await io.deploy(id => { if (UUID.test(id)) ownDeployment = id; });
      if (!UUID.test(ownDeployment)) throw new Error("invalid_deployment_id");
      target = await io.deployment(ownDeployment); production(target);
      if (target.deployment_trigger.metadata.commit_hash !== plan.commit) throw new Error("wrong_source_commit");
      next = records(plan, ownDeployment);
    }
    phase = "verify";
    if ((await io.current()).id !== target!.id) throw new Error("concurrent_deployment");
    await io.verify(target!, next!);
    if ((await io.current()).id !== target!.id) throw new Error("concurrent_deployment");
    phase = "activate";
    await write(next!, suspended, "publish: Verified production Pages deployment");
    if ((await io.current()).id !== target!.id) throw new Error("concurrent_deployment");
    if (!same(await readPolicies(io, plan), next!)) throw new Error("publication_changed");
    return { ok: true, phase: "complete", deployment_id: target!.id, contact_enabled: next!.some(p => p.enabled), origins: next!.length };
  } catch (error) {
    const allowed = new Set(["invalid_plan", "invalid_publication", "invalid_production_deployment", "publication_out_of_sync",
      "owner_required", "concurrent_deployment", "wrong_source_commit", "invalid_deployment_id", "pages_upload_failed",
      "published_form_mismatch", "publication_changed", "cloudflare_request_failed", "publication_query_failed", "wrong_production_branch"]);
    const code = error instanceof Error && allowed.has(error.message) ? error.message : `${phase}_failed`;
    if (!paused || !baseline || !previous) return { ok: false, phase, code, recovery: "unchanged" };
    try {
      let currentPolicies = await readPolicies(io, plan);
      if (!known.some(rows => same(rows, currentPolicies))) throw new Error("foreign_publication");
      // Fail closed even if activation committed but its response was lost.
      if (currentPolicies.some(p => p.enabled)) {
        const suspended = renew(currentPolicies, 0);
        await write(suspended, currentPolicies, "pause: Failed Pages publication");
        currentPolicies = suspended;
      }
      let current = await io.current(); production(current);
      if (current.id !== previous.id) {
        if (current.id !== ownDeployment) throw new Error("foreign_deployment");
        await io.rollback(previous.id);
        current = await io.current(); production(current);
      }
      if (current.id !== previous.id || baseline.some(p => p.deployment_id !== previous!.id)) throw new Error("rollback_unverified");
      await io.verify(previous, baseline);
      if ((await io.current()).id !== previous.id) throw new Error("concurrent_deployment");
      await write(renew(baseline), currentPolicies, "restore: Failed Pages publication recovered");
      if ((await io.current()).id !== previous.id) {
        const restored = await readPolicies(io, plan);
        if (known.some(rows => same(rows, restored))) await write(renew(restored, 0), restored, "pause: Concurrent Pages deployment during recovery");
        throw new Error("concurrent_deployment");
      }
      return { ok: false, phase, code, recovery: "restored", deployment_id: previous.id };
    } catch {
      return { ok: false, phase, code, recovery: "manual_review_required" };
    }
  }
}

export function cloudflareClient(token: string, account: string, database: string, fetchImpl: typeof fetch = fetch) {
  if (!token || token.trim() !== token || /\s/.test(token) || !/^[0-9a-f]{32}$/.test(account) || !UUID.test(database))
    throw new Error("invalid_cloudflare_credentials");
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
  async function api(path: string, body?: unknown) {
    try {
      const response = await fetchImpl(base + path, { method: body === undefined ? "GET" : "POST", redirect: "error",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const data = await response.json() as { success?: boolean; result?: unknown };
      if (!response.ok || data.success !== true || data.result === undefined) throw new Error();
      return data.result;
    } catch { throw new Error("cloudflare_request_failed"); }
  }
  return {
    current: async () => {
      const project = await api("/pages/projects/sorane") as { production_branch: string; canonical_deployment: Deployment };
      if (project.production_branch !== "main") throw new Error("wrong_production_branch");
      return project.canonical_deployment;
    },
    deployment: async (id: string) => {
      if (!UUID.test(id)) throw new Error("invalid_deployment_id");
      return await api(`/pages/projects/sorane/deployments/${id}`) as Deployment;
    },
    rollback: async (id: string) => {
      if (!UUID.test(id)) throw new Error("invalid_deployment_id");
      await api(`/pages/projects/sorane/deployments/${id}/rollback`, {});
    },
    query: async (batch: Statement[]) => {
      const results = await api(`/d1/database/${database}/query`, { batch }) as { success: boolean; results: Record<string, unknown>[] }[];
      if (!Array.isArray(results) || results.length !== batch.length || results.some(r => r.success !== true || !Array.isArray(r.results)))
        throw new Error("publication_query_failed");
      return results.map(r => r.results);
    },
  };
}

export async function verifyPublishedForm(d: Deployment, policies: Publication[], fetchImpl: typeof fetch = fetch) {
  production(d);
  for (const origin of [d.url, ...policies.map(p => p.origin)]) {
    const policy = policies.find(p => p.origin === origin) ?? policies[0];
    let verified = false;
    for (let attempt = 0; attempt < 6 && !verified; attempt++) {
      try {
        const response = await fetchImpl(origin + "/contact.html", { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(15000) });
        const html = withoutPagesTransforms(await response.text());
        const missing = policy.form_digest === digest("") && policy.enabled === 0;
        verified = missing ? !formPresent(html) : response.ok && digest(html) === policy.form_digest && (!policy.enabled || formPresent(html));
      } catch { /* A transient edge response must not activate an unverified form. */ }
      if (!verified && attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!verified) throw new Error("published_form_mismatch");
  }
}
