import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture } from "./helpers/admin-fixture.ts";

const ORIGINS=["https://public.sorane.example","https://alias.sorane.example"];
test("Pages inquiry deployment → same-origin API → isolated owner inbox",async t=>{
  const bundle=await build({entryPoints:[new URL("../packages/public-worker/src/pages-contact.ts",import.meta.url).pathname],
    bundle:true,write:false,format:"esm",platform:"node",target:"es2023"});
  const f=await fixture(t,{adminMode:"inquiries",engine:"e".repeat(64),bucket:"unused",workers:[{
    name:"pages-contact",routes:[...ORIGINS.map(origin=>origin+"/*"),"https://preview.pages.example/*"],modules:true,
    script:bundle.outputFiles[0].text,compatibilityDate:"2026-10-10",compatibilityFlags:["nodejs_compat","disallow_importable_env"],
    d1Databases:{DB:"pipeline-db"},bindings:{CONTACT_SITE_ID:"pages",CONTACT_ORIGINS:JSON.stringify(ORIGINS)},
  }]});
  await f.seedSite("pages",{owner:"owner",viewer:"viewer"});
  const worker=await f.mf.getWorker("pages-contact"),owner=await f.login("owner");
  const payload={request_id:randomUUID(),email:"example@example.test",subject:"Pages contact",body:"Private text",consent:true};
  const send=(origin=ORIGINS[0],extra:Record<string,string>={},value=payload)=>worker.fetch(origin+"/_contact",{
    method:"POST",headers:{Origin:origin,"Content-Type":"application/json",...extra},body:JSON.stringify(value)});
  assert.equal((await send()).status,404,"no implicit activation from a Pages hostname");
  const root=mkdtempSync(join(tmpdir(),"sorane-pages-policy-"));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const form=join(root,"contact.html");
  writeFileSync(form,'<form data-sorane-contact action="/_contact"></form>');
  const script=new URL("../packages/public-worker/scripts/pages-contact-policy.ts",import.meta.url).pathname;
  const args=[script,"--site","pages","--deployment",randomUUID(),"--form",form,"--actor","operator","--reason","Reviewed deployment"];
  const sql=execFileSync(process.execPath,[...args,...ORIGINS.flatMap(origin=>["--origin",origin])],{encoding:"utf8"});
  await f.db.batch(sql.split(/;\s*(?=INSERT|$)/).filter(value=>value.trim()).map(value=>f.db.prepare(value)));
  for(const origin of ['http://example.test','https://user:secret@example.test','https://example.test/path']) {
    const invalid=spawnSync(process.execPath,[...args,"--origin",origin],{encoding:"utf8"});
    assert.notEqual(invalid.status,0,"unsafe origins cannot produce activation SQL");
  }
  const created=await send();assert.equal(created.status,201);
  const {receipt}=await created.json() as {receipt:string};
  const retry=await send();assert.equal(retry.status,200);assert.deepEqual(await retry.json(),{receipt});
  const inbox=await owner.get("/api/sites/pages/inquiries");assert.equal(inbox.status,200);
  assert.equal((await inbox.json() as any).inquiries[0].subject,payload.subject);
  assert.equal((await send(ORIGINS[1],{}, {...payload,request_id:randomUUID()})).status,201);
  assert.equal((await send(ORIGINS[1],{Origin:ORIGINS[0]})).status,403);
  assert.equal((await send("https://preview.pages.example")).status,404);
  assert.equal((await worker.fetch(ORIGINS[0]+"/_contact")).status,405);
  assert.equal((await worker.fetch(ORIGINS[0]+"/_contact?email=private")).status,404);
  assert.equal((await worker.fetch(ORIGINS[0]+"/")).status,404);
  await f.db.prepare("UPDATE pages_contact_publication SET enabled=0 WHERE origin=?").bind(ORIGINS[0]).run();
  assert.equal((await send()).status,404);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM contact_inquiry").first<number>("n")),2);
  const html=await (await owner.get("/sites/pages/inquiries")).text();
  assert.match(html,/aria-current="page"[^>]*>[\s\S]*?問い合わせ/);
  assert.doesNotMatch(html,/確認・公開|>記事<|>設定</);
  assert.match(html,/href="https:\/\/public\.sorane\.example\/"/);
  const entry=await owner.get("/sites/pages");assert.equal(entry.status,303);assert.equal(entry.headers.get("Location"),"/sites/pages/inquiries");
  assert.equal((await owner.get("/sites/pages/editor")).status,404);
  assert.equal((await owner.post("/api/sites/pages/proposals",{})).status,404);
  assert.equal((await owner.post("/api/sites/pages/members",{})).status,404);
  const viewer=await f.login("viewer");assert.equal((await viewer.get("/sites/pages/inquiries")).status,403);
  await f.db.prepare("DELETE FROM site_member WHERE role='owner'").run();
  const ownerless=execFileSync(process.execPath,[...args,"--origin",ORIGINS[0]],{encoding:"utf8"});
  await assert.rejects(f.db.batch(ownerless.split(/;\s*(?=INSERT|$)/).filter(value=>value.trim()).map(value=>f.db.prepare(value))),/NOT NULL/);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM pages_contact_event').first<number>('n')),2,'failed activation rolls back its audit');
  assert.equal((await send(ORIGINS[1])).status,404,"unowned sites cannot receive private inquiries");
});
