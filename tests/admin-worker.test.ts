import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fixture, ROOT, ISSUER, ORIGIN, CLIENT, hash, now, COMMIT } from "./helpers/admin-fixture.ts";
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test("Mikaki-backed management Worker: real runtime, D1 and authorization boundaries", async (t) => {
  const f = await fixture(t);
  await f.seedSite("alpha", { owner: "owner", editor: "editor", publisher: "publisher", viewer: "viewer" });
  await f.seedSite("other", { otherOwner: "owner" });
  const owner = await f.login("owner"), editor = await f.login("editor");
  const publisher = await f.login("publisher"), viewer = await f.login("viewer"), outsider = await f.login("outsider");
  const revision = async (site = "alpha") => (await f.db.prepare("SELECT revision FROM site WHERE id=?").bind(site).first<{ revision: number }>())!.revision;
  const operation = async (fields: Record<string, unknown> = {}, site = "alpha") =>
    ({ operationId: randomUUID(), revision: await revision(site), ...fields });

  await t.test("login grants no roles; memberships and audit remain site-local", async () => {
    assert.equal((await f.request("/api/sites")).status, 401);
    assert.equal((await f.request("/api/sites", { headers: { Authorization: "Bearer userinfo-only" } })).status, 401);
    assert.deepEqual(await (await outsider.get("/api/sites")).json(), { sites: [] });
    assert.equal((await owner.get("/api/sites/other")).status, 404);
    assert.equal((await outsider.get("/api/sites/alpha")).status, 404);
    const details = await (await viewer.get("/api/sites/alpha")).json() as { members: unknown[] };
    assert.deepEqual(details.members, []);
    assert.equal((await editor.get("/api/sites/alpha/audit")).status, 403);
    const session = await (await owner.get("/api/session")).json() as { sub: string; csrf: string };
    assert.equal(session.sub, "owner"); assert.equal(session.csrf, owner.headers["X-CSRF-Token"]);
    const html = await (await owner.get("/sites/alpha")).text();
    assert.match(html, /確認・公開/); assert.match(html, /記事を検索/);
    assert.doesNotMatch(html, /name="commit"|name="changes"|name="sub"/);
    assert.match(await (await owner.get('/sites/alpha?view=settings')).text(), /メンバーと権限/);
    assert.equal((await viewer.get('/sites/alpha?view=settings')).status,403);
    assert.doesNotMatch(await (await viewer.get("/sites/alpha")).text(), /name="sub"/);
  });
  await t.test("CSRF, origin and bounded input protect all mutations", async () => {
    const value = await operation({ sub: "new-user", role: "viewer" });
    assert.equal((await owner.post("/api/sites/alpha/members", value, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await owner.post("/api/sites/alpha/members", value, { "X-CSRF-Token": "invalid" })).status, 403);
    assert.equal((await owner.post("/api/sites/alpha/members", { ...value, owner: true })).status, 400);
    assert.equal((await owner.post("/api/sites/alpha/members", { ...value, sub: "x".repeat(9000) })).status, 413);
    assert.equal((await editor.post("/api/sites/alpha/members", value)).status, 403);
    assert.equal((await viewer.post("/api/sites/alpha/proposals", await operation({ commit: COMMIT, message: "edit" }))).status, 403);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM admin_operation").first("n"), 0);
  });
  await t.test("roles are checked again inside the transaction after the OP check", async () => {
    f.onCheck(async () => { await f.db.prepare("UPDATE site_member SET role='viewer' WHERE site_id='alpha' AND sub='editor'").run(); });
    assert.equal((await editor.post("/api/sites/alpha/proposals", await operation({ commit: COMMIT, message: "revoked editor" }))).status, 409);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM proposal").first("n"), 0);
    await f.db.prepare("UPDATE site_member SET role='editor' WHERE site_id='alpha' AND sub='editor'").run();
  });
  await t.test("owner mutation is audited atomically and exact retries are idempotent", async () => {
    const value = await operation({ sub: "new-user", role: "viewer" });
    assert.equal((await owner.post("/api/sites/alpha/members", value)).status, 201);
    const beforeRetry = f.checks;
    const replay = await owner.post("/api/sites/alpha/members", value);
    assert.equal(replay.status, 200); assert.equal((await replay.json() as { replay: boolean }).replay, true);
    assert.equal(f.checks, beforeRetry + 1, "even retries need a fresh status check");
    assert.equal((await owner.post("/api/sites/alpha/members", { ...value, role: "editor" })).status, 409);
    assert.equal((await owner.post("/api/sites/alpha/members", { ...value, operationId: randomUUID() })).status, 409, "stale revision");
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM admin_operation WHERE id=?").bind(value.operationId).first("n"), 1);
    const audit = await (await owner.get("/api/sites/alpha/audit")).json() as { operations: { actor_sub: string }[] };
    assert.equal(audit.operations[0].actor_sub, "owner");
    await f.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON admin_operation BEGIN SELECT RAISE(ABORT,'test audit failure'); END;");
    const failed = await operation({ sub: "must-not-exist", role: "owner" });
    assert.equal((await owner.post("/api/sites/alpha/members", failed)).status, 503);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM site_member WHERE sub='must-not-exist'").first("n"), 0);
    assert.equal(await revision(), failed.revision);
    await f.db.exec("DROP TRIGGER fail_audit;");
  });
  await t.test("only a publisher/owner can approve the exact proposed commit", async () => {
    const proposal = await operation({ commit: COMMIT, message: "Human-reviewed update" });
    assert.equal((await editor.post("/api/sites/alpha/proposals", proposal)).status, 201);
    const candidate = "d".repeat(64);
    await f.db.prepare("UPDATE build_job SET status='ready',candidate_digest=?,engine_id=?,tree_hash=? WHERE proposal_id=?")
      .bind(candidate,"e".repeat(64),"f".repeat(40),proposal.operationId).run();
    const path = `/api/sites/alpha/proposals/${proposal.operationId}/approve`;
    assert.equal((await editor.post(path, await operation({ commit: COMMIT, candidate }))).status, 403);
    assert.equal((await publisher.post(path, await operation({ commit: "b".repeat(40), candidate }))).status, 409);
    const approval = await operation({ commit: COMMIT, candidate });
    const response = await publisher.post(path, approval);
    assert.equal(response.status, 201);
    const result = await response.json() as { state: string; deployed: boolean };
    assert.equal(result.state, "approved"); assert.equal(result.deployed, true);
    assert.equal((await publisher.post(path, approval)).status, 200);
    assert.equal((await publisher.post(path, await operation({ commit: COMMIT, candidate }))).status, 409);
    const row = await f.db.prepare("SELECT * FROM publication_approval WHERE proposal_id=?").bind(proposal.operationId).first();
    assert.equal(row!.commit_id, COMMIT); assert.equal(row!.approved_by, "publisher");
  });
  await t.test("colliding concurrent operation IDs cannot authorize stale effects in another site", async () => {
    await f.seedSite("race-valid", { "race-owner": "owner" });
    await f.seedSite("race-stale", { "race-owner": "owner" });
    const actor = await f.login("race-owner");
    await f.db.prepare("UPDATE site SET revision=2 WHERE id='race-stale'").run();
    for (let i = 0; i < 8; i++) {
      const operationId = randomUUID();
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      f.onCheck(async () => { f.onCheck(async () => { release(); }); await barrier; });
      const results = await Promise.all([
        actor.post("/api/sites/race-valid/members", { operationId, revision: await revision("race-valid"), sub: `valid-${i}`, role: "viewer" }),
        actor.post("/api/sites/race-stale/members", { operationId, revision: 1, sub: `must-not-exist-${i}`, role: "owner" }),
      ]);
      assert.deepEqual(results.map((r) => r.status), [201, 409]);
    }
    assert.equal(await revision("race-stale"), 2);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM site_member WHERE site_id='race-stale'").first("n"), 1);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM admin_operation WHERE site_id='race-stale'").first("n"), 0);
  });
  await t.test("the last owner cannot be removed or lost through concurrent demotions", async () => {
    assert.equal((await owner.post("/api/sites/alpha/members/remove", await operation({ sub: "owner" }))).status, 409);
    assert.equal((await owner.post("/api/sites/alpha/members", await operation({ sub: "owner", role: "viewer" }))).status, 409);
    assert.equal((await owner.post("/api/sites/alpha/members", await operation({ sub: "second-owner", role: "owner" }))).status, 201);
    const second = await f.login("second-owner"), rev = await revision();
    const responses = await Promise.all([
      owner.post("/api/sites/alpha/members", { operationId: randomUUID(), revision: rev, sub: "owner", role: "viewer" }),
      second.post("/api/sites/alpha/members", { operationId: randomUUID(), revision: rev, sub: "second-owner", role: "viewer" }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM site_member WHERE site_id='alpha' AND role='owner'").first("n"), 1);
  });
  await t.test("revocation and OP outage fail closed without granting operations", async () => {
    const revoked = await f.login("publisher");
    f.sessions.get(revoked.sid)!.active = false;
    assert.equal((await revoked.post("/session/check", {})).status, 401);
    assert.equal((await revoked.get("/api/sites")).status, 401);
    f.setOutage(true);
    const submitted = await operation({ commit: COMMIT, message: "must not submit offline" });
    assert.equal((await editor.post("/api/sites/alpha/proposals", submitted)).status, 503);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM proposal WHERE id=?").bind(submitted.operationId).first("n"), 0);
    assert.equal((await viewer.get("/api/sites")).status, 200, "reads may use an unexpired lease");
    await f.db.prepare("UPDATE rp_session SET lease_until=? WHERE sub='viewer'").bind(now() - 1).run();
    assert.equal((await viewer.get("/api/sites")).status, 503);
    f.setOutage(false);
    assert.equal((await viewer.get("/api/sites")).status, 200);
    await f.db.prepare("UPDATE rp_session SET parent_expires_at=? WHERE sub='viewer'").bind(now() - 1).run();
    assert.equal((await viewer.get("/api/sites")).status, 401, "parent expiry cannot be extended");
  });
  await t.test("back-channel logout wins over an in-flight positive session check", async () => {
    const delayed = await f.login("editor");
    f.onCheck(async () => { assert.equal((await f.backchannel(delayed.sid)).status, 200); });
    assert.equal((await delayed.post("/api/sites/alpha/proposals", await operation({ commit: COMMIT, message: "logout race" }))).status, 401);
    assert.equal((await delayed.get("/api/sites")).status, 401);
    assert.equal((await f.backchannel(delayed.sid)).status, 200, "logout is idempotent");
    assert.equal((await f.backchannel(editor.sid, { nonce: "invalid" })).status, 400);
  });
  await t.test("callback rejects wrong browser, issuer, nonce, audience and replay", async () => {
    const start = await f.begin("outsider");
    assert.equal((await f.request(start.target, { headers: { Cookie: "__Host-help-browser=wrong" } })).status, 400);
    assert.equal((await f.request(start.target.replace(encodeURIComponent(ISSUER), encodeURIComponent("https://evil.example")),
      { headers: { Cookie: start.browserCookie } })).status, 400);
    assert.equal((await f.request(start.target, { headers: { Cookie: start.browserCookie } })).status, 303);
    assert.equal((await f.request(start.target, { headers: { Cookie: start.browserCookie } })).status, 400);
    for (const claims of [{ nonce: "wrong" }, { aud: "another-client" }]) {
      const invalid = await f.begin("outsider", claims);
      assert.equal((await f.request(invalid.target, { headers: { Cookie: invalid.browserCookie } })).status, 401);
    }
    const stale = await f.begin("outsider");
    await f.db.prepare("UPDATE login_transaction SET expires_at=?").bind(now() - 1).run();
    assert.equal((await f.request(stale.target, { headers: { Cookie: stale.browserCookie } })).status, 400);
  });
  await t.test("HTML form mutation works and escapes untrusted titles/messages", async () => {
    const actor = await f.login("editor");
    const value = await operation({ commit: "c".repeat(40), message: '<img src=x onerror="alert(1)">' });
    const response = await f.request("/api/sites/alpha/proposals", { method: "POST", headers: {
      Cookie: actor.cookie, Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded",
    }, body: new URLSearchParams(Object.entries({ ...value, csrf: actor.headers["X-CSRF-Token"] })
      .map(([k, v]) => [k, String(v)])).toString() });
    assert.equal(response.status, 303); assert.equal(response.headers.get("Location"), "/sites/alpha?view=review");
    const html = await (await actor.get("/sites/alpha?view=review")).text();
    assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/);
    const logout = await f.request("/logout", { method: "POST", headers: { Cookie: actor.cookie, Origin: ORIGIN,
      "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: actor.headers["X-CSRF-Token"] }).toString() });
    assert.equal(logout.status, 303); assert.equal((await actor.get("/api/sites")).status, 401);
  });
  await t.test("revoked browser forms show sign-in recovery without admitting a mutation", async () => {
    const actor = await f.login("editor");
    const value = await operation({ commit: "d".repeat(40), message: "Rejected expired browser operation" });
    f.sessions.get(actor.sid)!.active = false;
    const response = await f.request("/api/sites/alpha/proposals", { method: "POST", headers: {
      Cookie: actor.cookie, Origin: ORIGIN, Accept: "text/html", "Content-Type": "application/x-www-form-urlencoded",
    }, body: new URLSearchParams(Object.entries({ ...value, csrf: actor.headers["X-CSRF-Token"] })
      .map(([key, item]) => [key, String(item)])).toString() });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("Content-Type")!, /^text\/html/);
    const html = await response.text();
    assert.match(html, /再度サインインしてください/);
    assert.match(html, /href="\/">管理画面に戻ってサインイン/);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM admin_operation WHERE id=?").bind(value.operationId).first("n"), 0);
    assert.equal(await revision(), value.revision);
    const api = await actor.post("/api/sites/alpha/proposals", value);
    assert.equal(api.status, 401);
    assert.match(api.headers.get("Content-Type")!, /^application\/json/);
  });
  await t.test("offline bootstrap pins identity and cannot overwrite an existing owner", async () => {
    const script = new URL("scripts/bootstrap.ts", ROOT).pathname;
    const command = (extra: string[]) => execFileSync(process.execPath, [script, "--issuer", ISSUER,
      "--client", CLIENT, "--origin", ORIGIN, ...extra], { encoding: "utf8" }).trim();
    const args = ["--mode", "site", "--site", "bootstrap", "--title", "Owner's site", "--namespace", "test",
      "--repository", "content", "--owner", "explicit-sub"];
    const statements = command(args).split(";\n").map((s) => f.db.prepare(s));
    await f.db.batch(statements);
    assert.equal(await f.db.prepare("SELECT sub FROM site_member WHERE site_id='bootstrap'").first("sub"), "explicit-sub");
    await assert.rejects(f.db.batch(statements), /UNIQUE/);
    const mismatch = command(args.map((v) => v === "bootstrap" ? "bad-bootstrap" : v)).replaceAll(sql(CLIENT), sql("other-client"));
    await assert.rejects(f.db.batch(mismatch.split(";\n").map((s) => f.db.prepare(s))), /NOT NULL/);
    assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM site WHERE id='bad-bootstrap'").first("n"), 0);
    await assert.rejects(f.db.prepare("UPDATE admin_instance SET client_id='other-client'").run(), /immutable/);
  });
  await t.test("repointing issuer, client or origin cannot reinterpret existing subjects", async () => {
    const variants: Record<string, string>[] = [{ CLIENT_ID: "other-client" },
      { ISSUER: "https://other-issuer.example" }, { RP_ORIGIN: "https://other-admin.example" },
      { PUBLIC_ORIGIN: ORIGIN }, { EXPECTED_ENGINE: "unconfigured" }];
    for (const bindings of variants) {
      await f.reconfigure(bindings);
      const origin = bindings.RP_ORIGIN ?? ORIGIN;
      assert.equal((await f.mf.dispatchFetch(`${origin}/api/session`)).status, 503);
      const database = await f.mf.getD1Database("DB","admin");
      assert.equal(await database.prepare("SELECT client_id FROM admin_instance").first("client_id"), CLIENT);
    }
  });
});

test('content draft admission uses Mikaki sessions and the existing atomic proposal authority',async(t)=>{
  const f=await fixture(t);
  await f.seedSite('drafts',{owner:'owner',editor:'editor',publisher:'publisher',viewer:'viewer'});
  const editor=await f.login('editor'), owner=await f.login('owner'), viewer=await f.login('viewer'), outsider=await f.login('outsider');
  const revision=()=>f.db.prepare("SELECT revision FROM site WHERE id='drafts'").first<number>('revision');
  const input=async()=>({operationId:randomUUID(),revision:await revision(),commit:COMMIT,message:'Generated manuscript',repositoryId:'pinned-repository',
    changes:[{path:'content/hello.md',before:'a'.repeat(64),text:'<script>untrusted manuscript</script>'},{path:'content/new.md',before:null,text:'A new article'}]});
  await t.test('drafts are bounded data and grant no roles or bearer access',async()=>{
    const value=await input();
    assert.equal((await viewer.post('/api/sites/drafts/drafts',value)).status,403);
    assert.equal((await outsider.post('/api/sites/drafts/drafts',value)).status,404);
    assert.equal((await f.request('/api/sites/drafts/drafts',{method:'POST',headers:{Authorization:'Bearer userinfo-only','Content-Type':'application/json'},body:JSON.stringify(value)})).status,401);
    assert.equal((await editor.post('/api/sites/drafts/drafts',value,{Origin:'https://evil.example'})).status,403);
    assert.equal((await editor.post('/api/sites/drafts/drafts',value,{'X-CSRF-Token':'wrong'})).status,403);
    for (const change of [{...value.changes[0],path:'../content/escape.md'},{...value.changes[0],path:'content/.git/leak.md'},
      {...value.changes[0],path:'content/run.js'},{...value.changes[0],text:'x'.repeat(65537)},{...value.changes[0],text:'\uD800'},
      {...value.changes[0],before:'not-a-hash'},{...value.changes[0],text:null,before:null},{...value.changes[0],actor:'owner'}])
      assert.equal((await editor.post('/api/sites/drafts/drafts',{...value,changes:[change]})).status,400);
    assert.equal((await editor.post('/api/sites/drafts/drafts',{...value,grant:'self-asserted'})).status,400);
    assert.equal((await editor.post('/api/sites/drafts/drafts',{...value,changes:[value.changes[0],value.changes[0]]})).status,400);
    assert.equal((await editor.post('/api/sites/drafts/drafts',{...value,changes:JSON.stringify(value.changes)})).status,400,'JSON callers must send an array');
    assert.equal((await editor.post('/api/sites/drafts/drafts',{...value,changes:[{...value.changes[0],text:'x'.repeat(196609)}]})).status,413);
    assert.equal(await revision(),1);
  });
  await t.test('draft, audit, proposal and build job commit once and preserve exact retries',async()=>{
    const value=await input(), responses=await Promise.all([editor.post('/api/sites/drafts/drafts',value),editor.post('/api/sites/drafts/drafts',value)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
    const row=await f.db.prepare('SELECT * FROM proposal_draft WHERE proposal_id=?').bind(value.operationId).first<{digest:string;payload:string}>();assert.ok(row);
    assert.equal(row.digest,createHash('sha256').update(row.payload).digest('hex'));
    assert.equal(await revision(),2);
    const replay=await editor.post('/api/sites/drafts/drafts',{...value,changes:[...value.changes].reverse()});assert.equal(replay.status,200);
    assert.equal((await replay.json() as {draft_digest:string}).draft_digest,row.digest);
    assert.equal((await editor.post('/api/sites/drafts/drafts',{...value,changes:[{...value.changes[0],text:'different'}]})).status,409);
    assert.equal(await f.db.prepare('SELECT expected_repository_id FROM proposal WHERE id=?').bind(value.operationId).first('expected_repository_id'),value.repositoryId);
    const audit=await f.db.prepare('SELECT payload,actor_kind,actor_sub FROM admin_operation WHERE id=?').bind(value.operationId).first<{payload:string;actor_kind:string;actor_sub:string}>();
    assert.equal(audit!.actor_kind,'human');assert.equal(audit!.actor_sub,'editor');assert.doesNotMatch(audit!.payload,/untrusted manuscript/);
    assert.equal(await f.db.prepare('SELECT count(*) AS n FROM build_job WHERE proposal_id=?').bind(value.operationId).first('n'),1);
    await assert.rejects(f.db.prepare("UPDATE proposal_draft SET payload='{}' WHERE proposal_id=?").bind(value.operationId).run(),/immutable/);
    await assert.rejects(f.db.prepare('DELETE FROM proposal_draft WHERE proposal_id=?').bind(value.operationId).run(),/retained/);
    const path=`/api/sites/drafts/proposals/${value.operationId}/draft`;
    assert.equal((await outsider.get(path)).status,404);
    const data=await (await viewer.get(path)).json() as {digest:string};assert.equal(data.digest,row.digest);
    const html=await (await viewer.get(path.replace('/api/','/'))).text();assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
    assert.match(await (await owner.get('/sites/drafts?view=review')).text(),/原稿の変更内容を見る/);
    const form=await f.request('/api/sites/drafts/drafts',{method:'POST',headers:{Cookie:editor.cookie,Origin:ORIGIN,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({...value,revision:String(value.revision),changes:JSON.stringify(value.changes),csrf:editor.headers['X-CSRF-Token']}).toString()});
    assert.equal(form.status,303);assert.equal(form.headers.get('Location'),'/sites/drafts?view=review');
    const large={...await input(),changes:[{path:'content/large.md',before:null,text:'x'.repeat(10000)}]};
    assert.equal((await editor.post('/api/sites/drafts/drafts',large)).status,201,'JSON draft intake accepts text beyond the normal 8 KiB mutation limit');
  });
  await t.test('authority revocation and draft storage failure roll back every effect',async()=>{
    const value=await input();
    f.onCheck(async()=>{await f.db.prepare("UPDATE site_member SET role='viewer' WHERE site_id='drafts' AND sub='editor'").run();});
    assert.equal((await editor.post('/api/sites/drafts/drafts',value)).status,409);
    assert.equal(await revision(),value.revision);
    await f.db.prepare("CREATE TRIGGER refuse_draft BEFORE INSERT ON proposal_draft BEGIN SELECT RAISE(ABORT,'storage unavailable'); END").run();
    assert.equal((await owner.post('/api/sites/drafts/drafts',value)).status,503);
    for (const table of ['admin_operation','proposal','build_job','proposal_draft'])
      assert.equal(await f.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${['build_job','proposal_draft'].includes(table)?'proposal_id':'id'}=?`).bind(value.operationId).first('n'),0);
    assert.equal(await revision(),value.revision);
    await f.db.prepare('DROP TRIGGER refuse_draft').run();
    f.setOutage(true);assert.equal((await owner.post('/api/sites/drafts/drafts',value)).status,503);f.setOutage(false);
    f.sessions.get(owner.sid)!.active=false;assert.equal((await owner.post('/api/sites/drafts/drafts',value)).status,401);
    assert.equal(await revision(),value.revision);
  });
});

test('draft preparation reads selected Git files, computes exact before hashes and refuses symlinks',async(t)=>{
  const dir=mkdtempSync(join(tmpdir(),'sorane-draft-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const git=(args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',dir,...args],{encoding:'utf8'}).trim();
  git(['init','-q']);mkdirSync(join(dir,'content'));writeFileSync(join(dir,'content/original.md'),'Original\n');writeFileSync(join(dir,'content/delete.md'),'Delete\n');
  git(['add','content']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Base']);
  const base=git(['rev-parse','HEAD']);writeFileSync(join(dir,'content/original.md'),'Generated replacement\n');writeFileSync(join(dir,'content/new.md'),'New\n');rmSync(join(dir,'content/delete.md'));
  const args=[new URL('scripts/prepare-draft.ts',ROOT).pathname,'--cwd',dir,'--base',base,'--repository-id','immutable-repo','--revision','3','--message','Generated draft'];
  const run=(paths:string[])=>execFileSync(process.execPath,[...args,...paths.flatMap(path=>['--path',path])],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const payload=JSON.parse(run(['content/original.md','content/delete.md','content/new.md']));assert.equal(payload.commit,base);assert.equal(payload.revision,3);
  assert.deepEqual(payload.changes,[{path:'content/delete.md',before:createHash('sha256').update('Delete\n').digest('hex'),text:null},
    {path:'content/new.md',before:null,text:'New\n'},{path:'content/original.md',before:createHash('sha256').update('Original\n').digest('hex'),text:'Generated replacement\n'}]);
  assert.equal(git(['rev-parse','HEAD']),base,'preparation does not commit or push');
  symlinkSync('original.md',join(dir,'content/link.md'));assert.throws(()=>run(['content/link.md']));assert.throws(()=>run(['../escape.md']));
  assert.throws(()=>run(['content/original.md','content/original.md']));
});

test("vendored Mikaki authentication stays byte-for-byte pinned to its source", () => {
  const metadata = JSON.parse(readFileSync(new URL("vendor/mikaki/source.json", ROOT), "utf8"));
  const digest = createHash("sha256").update(readFileSync(new URL("vendor/mikaki/oidc.ts", ROOT))).digest("hex");
  assert.equal(digest, metadata.sha256); assert.deepEqual(metadata.modifications, []);
  assert.match(metadata.commit, /^[0-9a-f]{40}$/);
});
