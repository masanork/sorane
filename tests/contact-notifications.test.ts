import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, now } from './helpers/admin-fixture.ts';
import { notificationWorkerFixture } from './helpers/contact-notifications.ts';
import { notificationPolicySql } from '../packages/public-worker/scripts/contact-notification-policy.ts';

const ORIGIN='https://notify.sorane.example';
test('private notification outbox: atomic enqueue, retry, leases, revocation and retention',async t=>{
  const mail=await notificationWorkerFixture();
  const f=await fixture(t,{engine:'e'.repeat(64),bucket:'unused',workers:[{
    name:'notification',routes:[ORIGIN+'/*'],modules:true,script:mail.script,compatibilityDate:'2026-10-10',
    compatibilityFlags:['nodejs_compat','disallow_importable_env'],d1Databases:{DB:'pipeline-db'},
    bindings:{CONTACT_SITE_ID:'notify',CONTACT_ORIGINS:JSON.stringify([ORIGIN])},
    serviceBindings:{MAIL_CAPTURE:mail.capture},
  }]});
  await f.seedSite('notify',{owner:'owner',viewer:'viewer'});
  const worker=await f.mf.getWorker('notification');
  const configure=(extra={})=>f.db.prepare(notificationPolicySql({site:'notify',from:'inquiries@notify.example',
    to:'owner@example.test',adminOrigin:'https://admin.example',...extra})).run();
  const seed=async()=>{
    const id=randomUUID();
    await f.db.prepare(`INSERT INTO contact_inquiry(id,site_id,request_id,payload_hash,name,email,subject,body,created_at,expires_at)
      VALUES(?,'notify',?,'hash','Private Name','private@example.test','Private subject','Private body',?,?)`)
      .bind(id,randomUUID(),now(),now()+3600).run();
    return id;
  };
  const drain=async()=>{const result=await worker.fetch(ORIGIN+'/__notification-test/drain');assert.equal(result.status,200);return result.json();};
  const state=(id:string)=>f.db.prepare('SELECT * FROM contact_notification WHERE inquiry_id=?').bind(id).first<Record<string,unknown>>();
  const due=(id:string)=>f.db.prepare('UPDATE contact_notification SET next_at=0,lease_until=0 WHERE inquiry_id=?').bind(id).run();
  await t.test('disabled by default; enabling does not backfill old inquiries',async()=>{
    const old=await seed();assert.equal(await state(old),null);
    await configure();assert.equal(await state(old),null);
  });
  await t.test('new inquiry atomically creates one job and sends only an authenticated inbox link',async()=>{
    const id=await seed();assert.equal((await state(id))!.state,'pending');
    await drain();assert.equal((await state(id))!.state,'sent');
    const message=mail.messages.at(-1)!;
    assert.equal(message.to,'owner@example.test');
    assert.match(message.text,new RegExp(`/sites/notify/inquiries/${id}`));
    assert.doesNotMatch(JSON.stringify(message),/Private Name|private@example.test|Private subject|Private body/);
    const count=mail.messages.length;await drain();assert.equal(mail.messages.length,count);
  });
  await t.test('temporary delivery failure backs off without losing an inquiry; retry succeeds',async()=>{
    const id=await seed();mail.fail('E_INTERNAL_SERVER_ERROR');await drain();
    let job=(await state(id))!;assert.equal(job.state,'pending');assert.equal(job.attempts,1);
    assert.equal(job.error_code,'E_INTERNAL_SERVER_ERROR');assert.ok(Number(job.next_at)>=now()+59);
    const count=mail.messages.length;await drain();assert.equal(mail.messages.length,count,'backoff enforced');
    assert.ok(await f.db.prepare('SELECT id FROM contact_inquiry WHERE id=?').bind(id).first());
    mail.fail(null);await due(id);await drain();job=(await state(id))!;
    assert.equal(job.state,'sent');assert.equal(job.attempts,2);assert.equal(job.error_code,null);
  });
  await t.test('concurrent drains and an unexpired lease send once',async()=>{
    const id=await seed(),count=mail.messages.length;
    await Promise.all([drain(),drain()]);assert.equal(mail.messages.length,count+1);assert.equal((await state(id))!.state,'sent');
    const abandoned=await seed();
    await f.db.prepare(`UPDATE contact_notification SET state='sending',attempts=1,lease_token='old',lease_until=? WHERE inquiry_id=?`)
      .bind(now()+60,abandoned).run();
    await drain();assert.equal((await state(abandoned))!.attempts,1);
    await due(abandoned);await drain();assert.equal((await state(abandoned))!.state,'sent');
  });
  await t.test('permanent/unknown failures never store exception text; attempts are bounded',async()=>{
    const terminal=await seed();mail.fail('E_RECIPIENT_SUPPRESSED');await drain();assert.equal((await state(terminal))!.state,'failed');
    const id=await seed();mail.fail('private-recipient@example.test');
    for(let i=0;i<8;i++){await due(id);await drain();}
    assert.equal((await state(id))!.state,'failed');assert.equal((await state(id))!.error_code,'send_failed');
    const count=mail.messages.length;await drain();assert.equal(mail.messages.length,count);mail.fail(null);
  });
  await t.test('destination generation change, disabled policy, expiration and owner removal cancel pending mail',async()=>{
    const changed=await seed();await configure({to:'new-owner@example.test'});await drain();assert.equal((await state(changed))!.state,'cancelled');
    const disabled=await seed();await f.db.prepare('UPDATE contact_notification_policy SET enabled=0').run();await drain();
    assert.equal((await state(disabled))!.state,'cancelled');const noJob=await seed();assert.equal(await state(noJob),null);
    await configure();const expired=await seed();await f.db.prepare('UPDATE contact_inquiry SET expires_at=0 WHERE id=?').bind(expired).run();
    await drain();assert.equal((await state(expired))!.state,'cancelled');
    const removed=await seed();await f.db.prepare("UPDATE site_member SET role='viewer' WHERE sub='owner'").run();await drain();
    assert.equal((await state(removed))!.state,'cancelled');
    await assert.rejects(configure(),/NOT NULL/);
    await f.db.prepare("UPDATE site_member SET role='owner' WHERE sub='owner'").run();await configure();
    await f.db.prepare('DELETE FROM contact_inquiry WHERE id=?').bind(expired).run();assert.equal(await state(expired),null);
  });
  await t.test('unsafe policy addresses and inbox origins are rejected',async()=>{
    for(const extra of [{to:'x@example.test\r\nBcc:y@example.test'},{adminOrigin:'https://user:password@admin.example'},
      {adminOrigin:'http://admin.example'},{adminOrigin:'https://admin.example/path'}])
      assert.throws(()=>notificationPolicySql({site:'notify',from:'inquiries@example.test',to:'owner@example.test',adminOrigin:'https://admin.example',...extra}));
    const id=await seed();await f.db.prepare("UPDATE contact_notification_policy SET admin_origin='https://user:pass@admin.example'").run();
    await drain();assert.equal((await state(id))!.error_code,'invalid_policy');await configure();
  });
  await t.test('actual API retry is idempotent; honeypot, conflict and unowned requests do not notify',async()=>{
    await f.db.prepare(`INSERT INTO pages_contact_event VALUES(?,'notify',?,?,?, ?,1,'fixture','test',?)`)
      .bind(randomUUID(),ORIGIN,randomUUID(),'f'.repeat(64),'c'.repeat(64),now()).run();
    await f.db.prepare(`INSERT INTO pages_contact_publication SELECT origin,site_id,id,deployment_id,form_digest,policy_digest,1,created_at FROM pages_contact_event`).run();
    const value={request_id:randomUUID(),email:'visitor@example.test',subject:'Private API subject',body:'Private API text',consent:true};
    const send=(payload=value)=>worker.fetch(ORIGIN+'/_contact',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    mail.fail('E_INTERNAL_SERVER_ERROR');const response=await send();assert.equal(response.status,201,await response.clone().text());
    const {receipt}=await response.json() as {receipt:string};
    const retry=await send();assert.equal(retry.status,200);assert.deepEqual(await retry.json(),{receipt});
    assert.equal((await send({...value,body:'changed'})).status,409);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM contact_notification WHERE inquiry_id=?').bind(receipt).first<number>('n')),1);
    const count=await f.db.prepare('SELECT COUNT(*) AS n FROM contact_notification').first<number>('n');
    assert.equal((await send({...value,request_id:randomUUID(),website:'bot'} as typeof value)).status,202);
    assert.equal(await f.db.prepare('SELECT COUNT(*) AS n FROM contact_notification').first<number>('n'),count);
    mail.fail(null);await due(receipt);await worker.scheduled();assert.equal((await state(receipt))!.state,'sent');
    await f.db.prepare("DELETE FROM site_member WHERE sub='owner'").run();
    assert.equal((await send({...value,request_id:randomUUID()})).status,404);
  });
});
