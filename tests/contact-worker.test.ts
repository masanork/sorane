import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { contactFixture, PUBLIC } from "./helpers/contact-fixture.ts";
import { now, ORIGIN } from "./helpers/admin-fixture.ts";
import { resolveContact } from "../packages/core/src/contact.ts";
import { mergeConfig } from "../packages/core/src/config.ts";

test("native contact configuration is opt-in and keeps submission on the site origin",()=>{
  assert.equal(resolveContact(mergeConfig()),undefined);
  const site = {title:"Site",description:"Test",lang:"ja",base_url:PUBLIC+"/nested/",contact:{form:{enabled:true}}};
  assert.equal(resolveContact({site})!.endpoint,"/nested/_contact");
  for (const base_url of ["","http://example.org","https://user:secret@example.org/","https://example.org/?x=1"]) {
    assert.throws(()=>resolveContact({site:{...site,base_url}}),/invalid_contact_base_url/);
  }
  for (const page of ["../contact.html","https://other.example/contact.html","contact.html?x=1"]) {
    assert.throws(()=>resolveContact({site:{...site,contact:{page,form:{enabled:true}}}}),/invalid_contact_page/);
  }
  assert.throws(()=>resolveContact({site:{...site,contact:{form:{enabled:true,privacy_notice:""}}}}),/invalid_contact_privacy_notice/);
});

test("published native contact → D1 receipt → owner inbox with managed authentication",async(t)=>{
  const f = await contactFixture(t);
  const send = (value: unknown, headers: Record<string,string> = {}) => f.publicWorker.fetch(PUBLIC+"/native/_contact",{
    method:"POST",headers:{Origin:PUBLIC,"Content-Type":"application/json","CF-Connecting-IP":"192.0.2.1",...headers},body:JSON.stringify(value)});
  const payload = (extra: Record<string,unknown> = {}) => ({request_id:randomUUID(),name:"Test visitor",email:"visitor@example.test",
    subject:"WebMCP question",body:"Please explain native contact.",consent:true,...extra});
  const count = async()=>f.db.prepare("SELECT COUNT(*) AS n FROM contact_inquiry").first<number>("n");
  const owner = await f.login("owner");
  const data = payload(), created = await send(data);
  assert.equal(created.status,201,await created.clone().text());
  assert.equal(created.headers.get("Cache-Control"),"no-store");
  const {receipt} = await created.json() as {receipt:string};
  assert.match(receipt,/^[0-9a-f-]{36}$/);
  const route = "/api/sites/native/inquiries";
  const row = (await (await owner.get(route+"/"+receipt)).json() as any).inquiry;
  assert.equal(row.body,data.body);assert.equal(row.email,data.email);assert.equal(row.expires_at-row.created_at,30*86400);
  assert.equal((await count()),1);
  await t.test("concurrent and lost-response retries use one receipt; changed payloads conflict",async()=>{
    const retries = await Promise.all([send(data),send(data),send(data)]);
    for (const response of retries) {assert.equal(response.status,200);assert.deepEqual(await response.json(),{receipt});}
    assert.equal((await send({...data,body:"Changed"})).status,409);
    assert.equal(await count(),1);
    const simultaneous = payload();
    const responses = await Promise.all([send(simultaneous),send(simultaneous),send(simultaneous)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,200,201]);
    const receipts = await Promise.all(responses.map(r=>r.json()));
    assert.deepEqual(receipts[0],receipts[1]);assert.deepEqual(receipts[1],receipts[2]);
    assert.equal(await count(),2);
  });
  await t.test("validation, consent, content type, size, origin and honeypot cannot store bad input",async()=>{
    for (const extra of [{consent:false},{email:"invalid"},{subject:""},{body:"x".repeat(8001)},{name:42},{body:"\0"},
      {request_id:"not-a-uuid"},{email:"a@example.test\r\nBcc: evil@example.test"},{unknown:"value"}])
      assert.equal((await send(payload(extra))).status,400,JSON.stringify(extra).slice(0,80));
    assert.equal((await send(payload(),{Origin:"https://other.example"})).status,403);
    assert.equal((await send(payload(),{Origin:""})).status,403);
    assert.equal((await send(payload(),{"Sec-Fetch-Site":"cross-site"})).status,403);
    assert.equal((await send(payload(),{"Content-Type":"text/plain"})).status,415);
    assert.equal((await send(payload({body:"x".repeat(100001)}))).status,413);
    assert.equal((await send(payload({website:"spam.example"}))).status,202);
    const duplicate = await f.publicWorker.fetch(PUBLIC+"/native/_contact",{method:"POST",headers:{Origin:PUBLIC,"Content-Type":"application/x-www-form-urlencoded"},body:"email=a%40example.test&email=b%40example.test"});
    assert.equal(duplicate.status,400);
    assert.equal(await count(),2);
  });
  await t.test("only owners can read inquiries; status changes require CSRF, fresh session and version",async()=>{
    assert.equal((await f.request(route)).status,401);
    for (const role of ["viewer","editor","publisher"]) {
      const session = await f.login(role);
      assert.equal((await session.get(route)).status,403);
      assert.equal((await session.get(route+"/"+receipt)).status,403);
      assert.equal((await session.post(route+"/"+receipt,{status:"closed",version:1})).status,403);
      assert.doesNotMatch(await (await session.get("/sites/native")).text(),/href="\/sites\/native\/inquiries"/);
    }
    assert.match(await (await owner.get("/sites/native")).text(),/href="\/sites\/native\/inquiries"/);
    assert.equal((await owner.post(route+"/"+receipt,{status:"closed",version:1},{"X-CSRF-Token":"invalid"})).status,403);
    assert.equal((await owner.post(route+"/"+receipt,{status:"unknown",version:1})).status,400);
    const changed = await owner.post(route+"/"+receipt,{status:"in_progress",version:1});
    assert.equal(changed.status,200);assert.equal((await changed.json() as any).version,2);
    assert.equal((await owner.post(route+"/"+receipt,{status:"closed",version:1})).status,409);
    const filtered = await owner.get(route+"?status=in_progress");
    assert.equal((await filtered.json() as any).inquiries.length,1);
    assert.equal((await owner.get(route+"?status=")).status,200);
    assert.equal((await owner.get(route+"?status=invalid")).status,400);
    assert.equal((await owner.get(route+"?before=invalid")).status,400);
    assert.equal((await owner.get(route+"/"+randomUUID())).status,404);
    await f.seedSite("other",{owner:"owner"});
    assert.equal((await owner.get("/api/sites/other/inquiries/"+receipt)).status,404);
    const checks = f.checks;
    await owner.get(route);
    assert.ok(f.checks>checks,"personal data reads must force a managed status check");
    f.sessions.get(owner.sid)!.active=false;
    assert.equal((await owner.get(route)).status,401);
    assert.equal((await owner.post(route+"/"+receipt,{status:"closed",version:2})).status,401);
  });
  await t.test("fresh role changes and issuer outages fail closed",async()=>{
    const live = await f.login("owner");
    f.onCheck(async()=>{await f.db.prepare("UPDATE site_member SET role='viewer' WHERE site_id='native' AND sub='owner'").run();});
    assert.equal((await live.get(route)).status,403);
    await f.db.prepare("UPDATE site_member SET role='owner' WHERE site_id='native' AND sub='owner'").run();
    f.setOutage(true);
    assert.equal((await live.get(route)).status,503);
    f.setOutage(false);
  });
  await t.test("rate limit is atomic; retries still work at the limit",async()=>{
    const responses = await Promise.all(Array.from({length:8},()=>send(payload())));
    assert.equal(responses.filter(r=>r.status===201).length,3);
    assert.equal(responses.filter(r=>r.status===429).length,5);
    assert.ok(responses.find(r=>r.status===429)!.headers.has("Retry-After"));
    assert.equal((await send(data)).status,200);
    assert.equal(await count(),5);
    assert.equal((await send(payload(),{"CF-Connecting-IP":"192.0.2.2"})).status,201);
    const hashes = await f.db.prepare("SELECT client_hash FROM contact_attempt").all<{client_hash:string}>();
    assert.ok(hashes.results.every(r=>/^[0-9a-f]{64}$/.test(r.client_hash)));
  });
  await t.test("an unpublished or contact-disabled candidate cannot accept; preview POST is forbidden",async()=>{
    await f.publish(false);
    assert.equal((await send(payload())).status,404);
    await f.publish();
    assert.equal((await f.publicWorker.fetch(PUBLIC+"/preview/"+f.proposal+"/"+"a".repeat(72)+"/_contact",{method:"POST"})).status,405);
    assert.equal((await f.publicWorker.fetch(PUBLIC+"/native/_contact")).status,405);
    await f.db.prepare("DELETE FROM site_publication WHERE site_id='native'").run();
    assert.equal((await send(payload())).status,404);
    await f.publish();
  });
  await t.test("expired inquiries disappear and cron deletes personal data and audit rows",async()=>{
    const live = await f.login("owner");
    await f.db.prepare("UPDATE contact_inquiry SET expires_at=? WHERE id=?").bind(now()-1,receipt).run();
    assert.equal((await live.get(route+"/"+receipt)).status,404);
    const admin = await f.mf.getWorker("admin");
    await admin.scheduled();
    assert.equal(await f.db.prepare("SELECT id FROM contact_inquiry WHERE id=?").bind(receipt).first(),null);
    assert.equal(await f.db.prepare("SELECT id FROM contact_status_event WHERE inquiry_id=?").bind(receipt).first(),null);
  });
  await t.test("plain HTML submissions work without JavaScript and never reflect input",async()=>{
    const response = await f.publicWorker.fetch(PUBLIC+"/native/_contact",{method:"POST",headers:{Origin:PUBLIC,
      "Content-Type":"application/x-www-form-urlencoded",Accept:"text/html","CF-Connecting-IP":"192.0.2.3"},
      body:new URLSearchParams({name:"<img src=x onerror=alert(1)>",email:"plain@example.test",subject:"Plain form",body:"No JS",consent:"yes",request_id:""}).toString()});
    assert.equal(response.status,201);
    const html = await response.text();
    assert.match(html,/問い合わせを受け付けました/);assert.doesNotMatch(html,/plain@example|onerror/);
  });
  await t.test("filtered inbox pagination returns each inquiry once",async()=>{
    const live=await f.login('owner');
    await f.db.batch(Array.from({length:30},(_,i)=>f.db.prepare(`INSERT INTO contact_inquiry
      (id,site_id,request_id,payload_hash,name,email,subject,body,status,created_at,expires_at)
      VALUES(?,'native',?,'fixture','','page@example.test',?,'Pagination fixture','closed',?,?)`)
      .bind(randomUUID(),randomUUID(),`Page ${i}`,now()-i,now()+3600)));
    const first=await (await live.get(route+'?status=closed')).json() as any;
    assert.equal(first.inquiries.length,25);assert.ok(first.next);
    const second=await (await live.get(route+'?status=closed&before='+first.next)).json() as any;
    assert.equal(second.inquiries.length,5);assert.equal(second.next,null);
    assert.equal(new Set([...first.inquiries,...second.inquiries].map((row:any)=>row.id)).size,30);
  });
});
