import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { build } from "esbuild";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Miniflare, convertV4MiniflareOptions, Response as MFResponse, type RequestInit as MFRequestInit } from "miniflare";
import { bundleWorker, engineId } from "../packages/ssg-worker/scripts/bundle.ts";
import { pushSources } from "../packages/ssg-worker/scripts/push-sources.ts";
import { fixture, now, ORIGIN } from "./helpers/admin-fixture.ts";

const PUBLIC = "https://public.sorane.example";
const sha = (kind: string, data: Buffer) => createHash("sha1").update(`${kind} ${data.length}\0`).update(data).digest("hex");
type Entry = {name:string;mode:string;hash:string;type:string};
type Repo = {tree:string;trees:Record<string,Entry[]>;blobs:Record<string,string>};
function repository(files: Record<string,string>, modes: Record<string,string> = {}): Repo {
  const blobs: Repo["blobs"] = {}, trees: Repo["trees"] = {};
  function tree(prefix: string): string {
    const names = [...new Set(Object.keys(files).filter((p)=>p.startsWith(prefix)).map((p)=>p.slice(prefix.length).split("/")[0]))];
    const entries = names.map((name): Entry => {
      const path=prefix+name;
      if (files[path] === undefined) return {name,mode:"40000",type:"tree",hash:tree(path+"/")};
      const data=Buffer.from(files[path]), hash=sha("blob",data), mode=modes[path]??"100644";
      blobs[hash]=data.toString("base64");
      return {name,mode,hash,type:mode==="120000"?"symlink":"blob"};
    }).sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.type==="tree"?"/":"\0")),Buffer.from(b.name+(b.type==="tree"?"/":"\0"))));
    const bytes=Buffer.concat(entries.map((e)=>Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`),Buffer.from(e.hash,"hex")])));
    const hash=sha("tree",bytes);trees[hash]=entries;return hash;
  }
  return {tree:tree(""),trees,blobs};
}
const markdown = (profile="0.1", title="Hello Artifacts") => `---\ntype: article\ntitle: ${title}\ntimestamp: 2026-10-08T00:00:00Z\nprofile: sorane-okf/${profile}\n---\n\n# ${title}\n\nBuilt by the real sorane engine.\n`;
const files = {"sorane.yaml":"site:\n  title: Artifacts test\n", "content/index.md":"---\ntype: index\ntitle: Artifacts site\nprofile: sorane-okf/0.1\n---\n\nWelcome.\n", "content/hello.md":markdown(),"static/note.txt":"inert asset"};
const pushSource={site:'alpha',repository:'alpha',repositoryId:'immutable-repository-id',ref:'refs/heads/main',accountId:'1'.repeat(32),subscriptionId:'2'.repeat(32),enabledAt:1};
test('push configuration is opt-in, bounded and pins each source',()=>{
  assert.deepEqual(pushSources('[]'),[]);assert.deepEqual(pushSources(JSON.stringify([pushSource])),[pushSource]);
  for(const value of [[{...pushSource,ref:'refs/heads/../other'}],[{...pushSource,subscriptionId:'any'}],[{...pushSource,extra:true}],
    [pushSource,pushSource],[pushSource,{...pushSource,site:'beta'}],Array(11).fill(pushSource),[{...pushSource,enabledAt:0}]])
    assert.throws(()=>pushSources(JSON.stringify(value)));
});

test("Workers filesystem confines asynchronous builds and guards both copy paths", async (t) => {
  const dir=mkdtempSync(join(tmpdir(),"sorane-worker-test-")), entry=join(dir,"worker.ts");
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const guard=new URL("../packages/ssg-worker/src/safe-fs.ts",import.meta.url).pathname;
  writeFileSync(entry,`import {isolated} from ${JSON.stringify(guard)};
    import {mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync} from 'node:fs';
    export default {async fetch(request){const root='/tmp'+new URL(request.url).pathname;return isolated(root,async()=>{
      mkdirSync(root,{recursive:true});writeFileSync(root+'/local','private data');await Promise.resolve();
      const blocked=[];for(const run of [()=>readFileSync('/bundle/private'),()=>writeFileSync(root+'/../escape','x'),
        ()=>copyFileSync('/bundle/private',root+'/copy'),()=>copyFileSync(root+'/local','/tmp/escape')]){
        try{run();blocked.push(false)}catch(e){blocked.push(e.message==='filesystem_path_outside_build')}
      }return Response.json({blocked,ancestor:existsSync('/tmp'),local:String(readFileSync(root+'/local'))});
    })}};`);
  const output=await bundleWorker(entry), mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,
    compatibilityDate:"2026-10-08",compatibilityFlags:["nodejs_compat","disallow_importable_env"]}));
  t.after(()=>mf.dispose());
  const responses=await Promise.all([mf.dispatchFetch("https://test.example/first"),mf.dispatchFetch("https://test.example/second")]);
  for(const response of responses)assert.deepEqual(await response.json(),{blocked:[true,true,true,true],ancestor:false,local:"private data"});
});

test("Artifacts → actual sorane engine → preview → exact candidate approval → R2 publication", async (t) => {
  const commits: Record<string,Repo> = {};
  function add(source: Record<string,string>, modes?:Record<string,string>) {const id=randomUUID().replaceAll("-","")+"a".repeat(8);commits[id]=repository(source,modes);return id;}
  const good=add(files), invalid=add({...files,"content/hello.md":"---\ntype: article\nprofile: sorane-okf/9.9\n---\n\nUnsupported profile."});
  const unsafe=add({...files,"content/hello.md":markdown()+"\n[unsafe](javascript:alert(1))"});
  const symlink=add({...files,"leak":"/bundle/secret"},{leak:"120000"});
  const traversal=add({...files,"sorane.yaml":"build:\n  content_dir: ../secret\n"});
  const fonts=add({...files,"sorane.yaml":"fonts:\n  enabled: true\n"});
  const large=add({...files,"static/large.txt":"x".repeat(262145)});
  const corrupt=add(files);const blob=Object.keys(commits[corrupt].blobs)[0];commits[corrupt].blobs[blob]=Buffer.from("wrong bytes").toString("base64");
  const badTree=add(files);commits[badTree].trees[commits[badTree].tree][0].name="tampered";
  const v2=add({...files,"content/hello.md":markdown("0.2","Profile two")});
  const v3=add({...files,"content/hello.md":markdown("0.3","Profile three")});
  const automatic=add({...files,"content/hello.md":markdown('0.1','Push-triggered proposal')});
  const refusedPush=add({...files,"content/hello.md":markdown('0.1','Refused push')});
  const rollbackPush=add({...files,"content/hello.md":markdown('0.1','Rollback push')});
  const nativeContact=add({...files,"sorane.yaml":"site:\n  title: Native contact\n  contact:\n    page: contact.html\n    form:\n      enabled: true\n",
    "content/contact.md":markdown('0.1','Native inquiry')});
  const sourceScript=`import {WorkerEntrypoint,RpcTarget} from 'cloudflare:workers';
    const commits=${JSON.stringify(commits)};
    class Repo extends RpcTarget {
      constructor(){super();this.current=null;}
      info(){return {name:'alpha',id:'immutable-repository-id'};}
      readCommit(hash){const c=this.current=commits[hash];return c?{hash,treeHash:c.tree,committedAt:1}:null;}
      readTree(hash){return this.current?.trees[hash]??null;}
      readBlob(hash){const b=this.current?.blobs[hash];return b?new Blob([Uint8Array.from(atob(b),ch=>ch.charCodeAt(0))]):null;}
    }
    export default class Source extends WorkerEntrypoint {get(name){if(name!=='alpha')throw Error('unknown repo');return new Repo();}}
  `;
  const ssg=await bundleWorker();
  const probeDir=mkdtempSync(join(tmpdir(),'sorane-push-test-'));t.after(()=>rmSync(probeDir,{recursive:true,force:true}));
  const probeEntry=join(probeDir,'worker.ts');
  writeFileSync(probeEntry,`import {admitPush} from ${JSON.stringify(new URL('../packages/ssg-worker/src/push.ts',import.meta.url).pathname)};
    export default {async fetch(request,env){try{return Response.json({proposal:await admitPush(await request.json(),env)});}catch{return new Response('Admission refused',{status:503});}}};`);
  const probe=await bundleWorker(probeEntry);
  const publicBundle=await build({entryPoints:[new URL("../packages/public-worker/src/worker.ts",import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"node",target:"es2023"});
  const common={modules:true,compatibilityDate:"2026-10-08",compatibilityFlags:["nodejs_compat","disallow_importable_env"]};
  const f=await fixture(t,{engine:engineId(),bucket:"pipeline-bucket",sourceService:{name:'builder',entrypoint:'ContentSource'},workers:[
    {...common,name:"source",script:sourceScript},
    {...common,name:'push-probe',script:probe.outputFiles[0].text,d1Databases:{DB:'pipeline-db'},
      bindings:{ARTIFACTS_NAMESPACE:'test-namespace',ARTIFACTS_PUSH_SOURCES:JSON.stringify([pushSource])},serviceBindings:{ARTIFACTS:'source'}},
    {...common,name:"builder",script:ssg.outputFiles[0].text,d1Databases:{DB:"pipeline-db"},r2Buckets:{BUILDS:"pipeline-bucket"},
      bindings:{ARTIFACTS_NAMESPACE:"test-namespace",PUBLIC_ORIGIN:PUBLIC,BUILD_QUEUE_NAME:"test-builds",ARTIFACTS_PUSH_SOURCES:JSON.stringify([pushSource])},serviceBindings:{ARTIFACTS:"source"},
      queueConsumers:{"test-builds":{maxBatchSize:1,maxBatchTimeout:0,maxRetries:0}},
      outboundService:()=>{assert.fail("content builds must not make outbound HTTP requests");return new MFResponse("blocked",{status:403});}},
    {...common,name:"public",routes:[PUBLIC+"/*"],script:publicBundle.outputFiles[0].text,d1Databases:{DB:"pipeline-db"},r2Buckets:{BUILDS:"pipeline-bucket"},bindings:{PUBLIC_ORIGIN:PUBLIC}},
  ]});
  await f.seedSite("alpha",{editor:"editor",publisher:"publisher",owner:"owner",viewer:"viewer"});
  const editor=await f.login("editor"), publisher=await f.login("publisher"), owner=await f.login("owner"), viewer=await f.login("viewer");
  let publicWorker=await f.mf.getWorker("public"), bucket=await f.mf.getR2Bucket("BUILDS","public");
  const fetchPublic=(path:string,init?:MFRequestInit)=>publicWorker.fetch(new URL(path,PUBLIC).href,init);
  const revision=async()=>await f.db.prepare("SELECT revision FROM site WHERE id='alpha'").first<number>("revision");
  async function submit(commit:string) {
    const id=randomUUID();
    const response=await editor.post("/api/sites/alpha/proposals",{operationId:id,revision:await revision(),commit,message:"Build and review"});
    assert.equal(response.status,201,await response.text());return id;
  }
  async function completed(id:string) {
    for(let i=0;i<100;i++) {
      const row=await f.db.prepare("SELECT * FROM build_job WHERE proposal_id=?").bind(id).first<Record<string,unknown>>();
      if(row?.status==='ready'||row?.status==='failed')return row;
      await delay(50);
    }
    assert.fail("build did not finish");
  }
  const id=await submit(good), ready=await completed(id), candidate=String(ready.candidate_digest);
  assert.equal(ready.status,"ready",JSON.stringify(ready));assert.equal(ready.engine_id,engineId());
  assert.equal(ready.tree_hash,commits[good].tree);assert.equal(ready.repository_id,"immutable-repository-id");
  assert.equal((await fetchPublic("/alpha/")).status,404,"build completion does not publish");
  const path=`/api/sites/alpha/proposals/${id}`;
  await t.test("browser preview forms provide a link without a cross-origin form redirect",async()=>{
    const response=await f.request(path+"/preview",{method:"POST",headers:{Cookie:owner.cookie,Origin:ORIGIN,
      "Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrf:owner.headers["X-CSRF-Token"]}).toString()});
    assert.equal(response.status,200);assert.equal(response.headers.get("Location"),null);
    assert.match(response.headers.get("Content-Security-Policy")!,/form-action 'self' https:\/\/mikaki\.example;/);
    const html=await response.text();const url=/href="(https:\/\/public\.sorane\.example\/preview\/[^\"]+)"/.exec(html)?.[1];
    assert.ok(url);assert.match(html,/rel="noreferrer"/);assert.equal((await publicWorker.fetch(url)).status,200);
    assert.equal((await fetchPublic("/alpha/")).status,404,"preview must not publish");
  });
  await t.test("preview serves generated HTML and assets using a short-lived, session-bound ticket",async()=>{
    const response=await viewer.post(path+"/preview",{});assert.equal(response.status,201);
    const ticket=await response.json() as {url:string;expires_at:number};assert.ok(ticket.expires_at<=now()+60);
    const preview=await publicWorker.fetch(ticket.url);assert.equal(preview.status,200);
    assert.equal(preview.headers.get("Cache-Control"),"no-store");assert.equal(preview.headers.get("X-Sorane-Candidate"),candidate);
    assert.match(await preview.text(),/Hello Artifacts/);
    const page=await publicWorker.fetch(ticket.url+"hello.html");assert.match(await page.text(),/Built by the real sorane engine/);
    assert.equal(await (await publicWorker.fetch(ticket.url+"static/note.txt")).text(),"inert asset");
    assert.equal((await publicWorker.fetch(ticket.url.replace(/.$/,"x/"))).status,404);
    assert.equal((await publicWorker.fetch(ticket.url+"_headers")).status,404);
    await f.backchannel(viewer.sid);assert.equal((await publicWorker.fetch(ticket.url)).status,404,"logout invalidates existing tickets");
  });
  await t.test("only the exact ready candidate and current engine can be approved",async()=>{
    const value={operationId:randomUUID(),revision:await revision(),commit:good,candidate};
    assert.equal((await editor.post(path+"/approve",value)).status,403);
    assert.equal((await publisher.post(path+"/approve",{...value,candidate:"0".repeat(64)})).status,409);
    await f.reconfigure({EXPECTED_ENGINE:"0".repeat(64)});
    assert.equal((await publisher.post(path+"/approve",value)).status,409);
    await f.reconfigure({EXPECTED_ENGINE:engineId()});
    publicWorker=await f.mf.getWorker("public");bucket=await f.mf.getR2Bucket("BUILDS","public");
    const response=await publisher.post(path+"/approve",value);assert.equal(response.status,201,await response.clone().text());
    assert.equal((await response.json() as {deployed:boolean}).deployed,true);
    assert.equal((await publisher.post(path+"/approve",value)).status,200);
    const output=await fetchPublic("/alpha/hello.html");assert.equal(output.status,200);assert.match(await output.text(),/Hello Artifacts/);
    assert.equal(output.headers.get("X-Sorane-Candidate"),candidate);
    assert.equal((await fetchPublic("/alpha/hello.html",{headers:{"If-None-Match":output.headers.get("ETag")!}})).status,304);
    const etag=output.headers.get("ETag")!;
    for (const value of [`W/${etag}`,`"other,tag", W/${etag}`,"*"]) {
      const cached=await fetchPublic("/alpha/hello.html",{headers:{"If-None-Match":value}});
      assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
      assert.equal(cached.headers.get("X-Sorane-Candidate"),candidate);
    }
    for (const value of ['W/"other"',`${etag}junk`,`${etag},`])
      assert.equal((await fetchPublic("/alpha/hello.html",{headers:{"If-None-Match":value}})).status,200);
    assert.equal((await fetchPublic("/alpha/hello.html",{method:"HEAD",headers:{"If-None-Match":`W/${etag}`}})).status,304);
    assert.equal((await fetchPublic("/alpha/hello.html",{method:"HEAD"})).status,200);
    assert.equal((await fetchPublic("/alpha/",{method:"POST"})).status,405);
    await assert.rejects(f.db.prepare("UPDATE build_job SET candidate_digest=? WHERE proposal_id=?").bind("1".repeat(64),id).run(),/immutable/);
    await assert.rejects(f.db.prepare("UPDATE site SET artifact_repository='other' WHERE id='alpha'").run(),/immutable/);
  });
  await t.test("invalid, oversized, escaped and inconsistent source never replaces publication",async()=>{
    for(const [commit,expected] of [[invalid,"validation_failed"],[unsafe,"validation_failed"],[symlink,"source_symlink_or_submodule"],
      [traversal,"invalid_build_directory"],[fonts,"feature_requires_linux_build_profile"],[large,"source_size_limit"],
      [corrupt,"blob_hash_mismatch"],[badTree,"tree_hash_mismatch"]]) {
      const badId=await submit(commit), job=await completed(badId);assert.equal(job.status,"failed",JSON.stringify(job));assert.equal(job.error,expected);
      assert.equal(job.candidate_digest,null);
      assert.equal((await publisher.post(`/api/sites/alpha/proposals/${badId}/approve`,{operationId:randomUUID(),revision:await revision(),commit,candidate})).status,409);
      assert.equal((await fetchPublic("/alpha/")).headers.get("X-Sorane-Candidate"),candidate);
    }
    for(const commit of [v2,v3])assert.equal((await completed(await submit(commit))).status,"ready","precompiled profile validators work in workerd");
  });
  const event=(commit:string)=>({type:'cf.artifacts.repo.pushed',source:{type:'artifacts.repo',namespace:'test-namespace',repoName:'alpha'},
    payload:{ref:'refs/heads/main',before:good,after:commit},metadata:{accountId:pushSource.accountId,eventSubscriptionId:pushSource.subscriptionId,eventSchemaVersion:1,eventTimestamp:new Date().toISOString()}});
  const probePush=async(value:unknown)=>(await f.mf.getWorker('push-probe')).fetch('https://fixture.example/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  await t.test('a real Queue event admits an audited service proposal once and leaves publication unchanged',async()=>{
    const producer=await f.mf.getQueueProducer('BUILD_QUEUE','admin'), before=await revision();
    await Promise.all([producer.send(event(automatic)),producer.send(event(automatic))]);
    let proposal:string|null=null;
    for(let i=0;i<100&&!proposal;i++) {proposal=await f.db.prepare('SELECT proposal_id FROM artifact_push WHERE commit_id=?').bind(automatic).first<string>('proposal_id');if(!proposal)await delay(50);}
    assert.ok(proposal);const job=await completed(proposal);assert.equal(job.status,'ready');assert.notEqual(job.candidate_digest,candidate);
    assert.equal(await revision(),before!+1);
    const audit=await f.db.prepare('SELECT actor_kind,actor_sub FROM admin_operation WHERE id=?').bind(proposal).first();
    assert.deepEqual(audit,{actor_kind:'artifacts',actor_sub:`artifacts:${pushSource.subscriptionId}`});
    assert.equal(await f.db.prepare('SELECT expected_repository_id FROM proposal WHERE id=?').bind(proposal).first<string>('expected_repository_id'),pushSource.repositoryId);
    assert.equal((await fetchPublic('/alpha/')).headers.get('X-Sorane-Candidate'),candidate);
    const html=await (await owner.get('/sites/alpha?view=review')).text();assert.match(html,/Artifactsのpushで自動作成/);
    await assert.rejects(f.db.prepare("INSERT INTO admin_operation(id,site_id,actor_sub,action,payload,site_revision,created_at,actor_kind) VALUES(?,'alpha','service','proposal.approve','{}',1,1,'artifacts')").bind(randomUUID()).run(),/Artifacts can only submit/);
  });
  await t.test('wrong sources, subscriptions, accounts, refs and event schemas admit no work',async()=>{
    const before=await revision(), base=event(refusedPush);
    for(const value of [{...base,type:'cf.artifacts.repo.deleted'},{...base,source:{...base.source,namespace:'other'}},
      {...base,source:{...base.source,repoName:'other'}},{...base,payload:{...base.payload,ref:'refs/heads/other'}},
      {...base,payload:{...base.payload,after:'0'.repeat(40)}},{...base,metadata:{...base.metadata,accountId:'3'.repeat(32)}},
      {...base,metadata:{...base.metadata,eventSubscriptionId:'3'.repeat(32)}},{...base,metadata:{...base.metadata,eventSchemaVersion:2}},
      {...base,metadata:{...base.metadata,eventTimestamp:'1970-01-01T00:00:00Z'}}]){
      const response=await probePush(value);assert.equal(response.status,200);assert.deepEqual(await response.json(),{proposal:null});
    }
    assert.equal(await revision(),before);
    assert.equal(await f.db.prepare('SELECT count(*) AS n FROM artifact_push WHERE commit_id=?').bind(refusedPush).first<number>('n'),0);
  });
  await t.test('push receipt failure rolls back proposal, audit, job and revision',async()=>{
    const before=await revision(), auditCount=await f.db.prepare('SELECT count(*) AS n FROM admin_operation').first<number>('n'), jobCount=await f.db.prepare('SELECT count(*) AS n FROM build_job').first<number>('n');
    await f.db.prepare("CREATE TRIGGER refuse_push BEFORE INSERT ON artifact_push BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END").run();
    assert.equal((await probePush(event(rollbackPush))).status,503);
    assert.equal(await revision(),before);assert.equal(await f.db.prepare('SELECT count(*) AS n FROM proposal WHERE commit_id=?').bind(rollbackPush).first<number>('n'),0);
    assert.equal(await f.db.prepare('SELECT count(*) AS n FROM admin_operation').first<number>('n'),auditCount);
    assert.equal(await f.db.prepare('SELECT count(*) AS n FROM build_job').first<number>('n'),jobCount);
    await f.db.prepare('DROP TRIGGER refuse_push').run();
  });
  const hashText=(text:string)=>createHash('sha256').update(text).digest('hex');
  const draftValue=async(changes:unknown[],repositoryId='immutable-repository-id')=>({operationId:randomUUID(),revision:await revision(),commit:good,message:'Manuscript draft',repositoryId,changes});
  const draftText=markdown('0.1','Reviewed manuscript');
  let draftProposal='',draftCandidate='';
  await t.test('a Markdown replacement is built from the exact base and previewed without Git or publication writes',async()=>{
    const changes=[{path:'content/hello.md',before:hashText(files['content/hello.md']),text:draftText},{path:'content/new.md',before:null,text:markdown('0.1','New draft article')}];
    const value=await draftValue(changes),response=await owner.post('/api/sites/alpha/drafts',value);
    assert.equal(response.status,201,await response.clone().text());draftProposal=value.operationId;
    const receipt=await response.json() as {draft_digest:string},job=await completed(draftProposal);
    assert.equal(job.status,'ready',JSON.stringify(job));draftCandidate=String(job.candidate_digest);assert.notEqual(draftCandidate,candidate);
    const manifest=JSON.parse(await (await bucket.get(`manifests/${draftCandidate}`))!.text());
    assert.equal(manifest.commit,good);assert.equal(manifest.tree,commits[good].tree);assert.equal(manifest.repository,'immutable-repository-id');
    assert.deepEqual(manifest.draft,{schema:1,digest:receipt.draft_digest});
    assert.equal((await fetchPublic('/alpha/hello.html')).headers.get('X-Sorane-Candidate'),candidate);
    const preview=await owner.post(`/api/sites/alpha/proposals/${draftProposal}/preview`,{});assert.equal(preview.status,201);
    const ticket=await preview.json() as {url:string};assert.match(await (await publicWorker.fetch(ticket.url+'hello.html')).text(),/Reviewed manuscript/);
    assert.match(await (await publicWorker.fetch(ticket.url+'new.html')).text(),/New draft article/);
    assert.equal(files['content/hello.md'].includes('Reviewed manuscript'),false,'the Artifacts fixture remains unchanged');
    assert.equal((await publisher.post(`/api/sites/alpha/proposals/${draftProposal}/approve`,{operationId:randomUUID(),revision:await revision(),commit:good,candidate})).status,409);
  });
  await t.test('draft source identity, path boundaries and before hashes are checked by the actual builder',async()=>{
    for (const [changes,repo,reason] of [
      [[{path:'content/hello.md',before:hashText(files['content/hello.md']),text:draftText}],'substituted-repository','repository_identity_mismatch'],
      [[{path:'content/hello.md',before:'0'.repeat(64),text:draftText}],'immutable-repository-id','draft_base_mismatch'],
      [[{path:'content/hello.md',before:null,text:draftText}],'immutable-repository-id','draft_base_mismatch'],
      [[{path:'README.md',before:null,text:'outside content'}],'immutable-repository-id','draft_path_not_content'],
      [[{path:'content/hello.md',before:hashText(files['content/hello.md']),text:markdown()+'\n[bad](javascript:alert(1))'}],'immutable-repository-id','validation_failed'],
    ] as const) {
      const value=await draftValue([...changes],repo),response=await owner.post('/api/sites/alpha/drafts',value);assert.equal(response.status,201);
      const job=await completed(value.operationId);assert.equal(job.status,'failed',JSON.stringify(job));assert.equal(job.error,reason);assert.equal(job.candidate_digest,null);
      assert.equal((await fetchPublic('/alpha/')).headers.get('X-Sorane-Candidate'),candidate);
    }
    const deleted=await draftValue([{path:'content/hello.md',before:hashText(files['content/hello.md']),text:null}]);
    assert.equal((await owner.post('/api/sites/alpha/drafts',deleted)).status,201);assert.equal((await completed(deleted.operationId)).status,'ready');
    const preview=await owner.post(`/api/sites/alpha/proposals/${deleted.operationId}/preview`,{}),ticket=await preview.json() as {url:string};
    assert.equal((await publicWorker.fetch(ticket.url+'hello.html')).status,404);
  });
  await t.test('missing or corrupted retained draft data never falls back to a plain commit build',async()=>{
    const payload=JSON.stringify({schema:1,repository:'immutable-repository-id',changes:[{path:'content/hello.md',before:hashText(files['content/hello.md']),text:draftText}]}),digest=hashText(payload);
    for (const [expected,stored,body] of [[digest,null,null],[digest,'0'.repeat(64),payload],[digest,digest,payload.replace('Reviewed manuscript','Substituted text')]] as const) {
      const proposal=randomUUID();
      await f.db.batch([
        f.db.prepare("INSERT INTO admin_operation(id,site_id,actor_sub,action,payload,site_revision,created_at) VALUES(?,'alpha','owner','proposal.submit','{}',1,1)").bind(proposal),
        f.db.prepare("INSERT INTO proposal(id,site_id,commit_id,message,submitted_by,created_at,expected_repository_id,draft_digest) VALUES(?,'alpha',?,'Integrity fixture','owner',1,'immutable-repository-id',?)").bind(proposal,good,expected),
        ...(stored?[f.db.prepare('INSERT INTO proposal_draft(proposal_id,digest,payload) VALUES(?,?,?)').bind(proposal,stored,body)]:[]),
        f.db.prepare('INSERT INTO build_job(proposal_id) VALUES(?)').bind(proposal),
      ]);
      await (await f.mf.getQueueProducer('BUILD_QUEUE','admin')).send({proposalId:proposal});
      const job=await completed(proposal);assert.equal(job.status,'failed');assert.equal(job.error,'draft_digest_mismatch');assert.equal(job.candidate_digest,null);
      assert.equal((await fetchPublic('/alpha/')).headers.get('X-Sorane-Candidate'),candidate);
    }
  });
  await t.test("membership removal invalidates preview; damaged objects fail closed",async()=>{
    const response=await editor.post(path+"/preview",{}), ticket=await response.json() as {url:string};assert.equal(response.status,201);
    assert.equal((await publicWorker.fetch(ticket.url)).status,200);
    assert.equal((await owner.post("/api/sites/alpha/members/remove",{operationId:randomUUID(),revision:await revision(),sub:"editor"})).status,201);
    assert.equal((await publicWorker.fetch(ticket.url)).status,404);
    const manifest=JSON.parse(await (await bucket.get(`manifests/${candidate}`))!.text()) as {files:{path:string;digest:string}[]};
    const page=manifest.files.find((f)=>f.path==="hello.html")!;await bucket.put(`blobs/${page.digest}`,"corrupted");
    assert.equal((await fetchPublic("/alpha/hello.html")).status,503);
  });
  await t.test('an exact human approval publishes the existing draft bytes without rebuilding',async()=>{
    const before=await f.db.prepare('SELECT completed_at FROM build_job WHERE proposal_id=?').bind(draftProposal).first('completed_at');
    const value={operationId:randomUUID(),revision:await revision(),commit:good,candidate:draftCandidate};
    assert.equal((await publisher.post(`/api/sites/alpha/proposals/${draftProposal}/approve`,value)).status,201);
    const output=await fetchPublic('/alpha/hello.html');assert.equal(output.status,200);assert.match(await output.text(),/Reviewed manuscript/);
    assert.equal(output.headers.get('X-Sorane-Candidate'),draftCandidate);
    assert.equal(await f.db.prepare('SELECT completed_at FROM build_job WHERE proposal_id=?').bind(draftProposal).first('completed_at'),before);
  });
  await t.test('the article editor reads private immutable source and preserves the whole retained draft',async()=>{
    const reader=await f.login('viewer');
    const link=`/sites/alpha/editor?${new URLSearchParams({proposal:draftProposal,path:'content/hello.md'})}`;
    const html=await (await owner.get(link)).text();assert.match(html,/Reviewed manuscript/);assert.match(html,/name="title"/);
    assert.doesNotMatch(html,/name="commit"|name="repositoryId"|name="changes"/);
    const read=await reader.get(link);assert.equal(read.status,200);assert.match(await read.text(),/readonly/);
    const value={operationId:randomUUID(),revision:await revision(),proposalId:draftProposal,path:'content/hello.md',
      title:'直感的な編集 <script>',body:'# 直感的な編集\n\n'+('本文を直接編集できます。'.repeat(900))};
    assert.equal((await reader.post('/api/sites/alpha/editor',value)).status,403);
    assert.equal((await owner.post('/api/sites/alpha/editor',{...value,repositoryId:'self-selected'})).status,400);
    assert.equal((await owner.post('/api/sites/alpha/editor',value,{Origin:'https://evil.example'})).status,403);
    const save=await owner.post('/api/sites/alpha/editor',value);assert.equal(save.status,201,await save.clone().text());
    assert.equal((await owner.post('/api/sites/alpha/editor',value)).status,200,'exact retry after a lost save reply');
    const job=await completed(value.operationId);assert.equal(job.status,'ready',JSON.stringify(job));
    const retained=await (await owner.get(`/api/sites/alpha/proposals/${value.operationId}/draft`)).json() as {changes:{path:string;before:string|null;text:string}[]};
    assert.equal(retained.changes.length,2);assert.equal(retained.changes.find(c=>c.path==='content/hello.md')!.before,hashText(files['content/hello.md']));
    assert.match(retained.changes.find(c=>c.path==='content/hello.md')!.text,/timestamp: 2026-10-08/);
    assert.equal(retained.changes.find(c=>c.path==='content/new.md')!.text,markdown('0.1','New draft article'));
    const preview=await owner.post(`/api/sites/alpha/proposals/${value.operationId}/preview`,{}),ticket=await preview.json() as {url:string};
    const output=await (await publicWorker.fetch(ticket.url+'hello.html')).text();assert.match(output,/本文を直接編集/);assert.match(output,/<title>直感的な編集 &lt;script&gt;<\/title>/);
    assert.equal((await fetchPublic('/alpha/hello.html')).headers.get('X-Sorane-Candidate'),draftCandidate,'saving never publishes');
    const existing=await owner.get(`/sites/alpha?proposal=${value.operationId}`);assert.match(await existing.text(),/直感的な編集 &lt;script&gt;/);
    const noChange={...value,operationId:randomUUID(),revision:await revision(),proposalId:value.operationId};
    assert.equal((await owner.post('/api/sites/alpha/editor',noChange)).status,400);
    assert.equal((await owner.post('/api/sites/alpha/editor',{...noChange,path:'sorane.yaml',body:'escape'})).status,404);
    const unavailable=await owner.post('/api/sites/alpha/editor',{...noChange,proposalId:randomUUID()});assert.equal(unavailable.status,404);
    const fresh={...noChange,path:'',title:'新しい記事',body:'# 新しい記事\n\n本文です。'};
    const created=await owner.post('/api/sites/alpha/editor',fresh);assert.equal(created.status,201,await created.clone().text());
    assert.equal((await owner.post('/api/sites/alpha/editor',fresh)).status,200,'new article timestamp is stable on retry');
    assert.equal((await completed(fresh.operationId)).status,'ready');
    const data=await (await owner.get(`/api/sites/alpha/proposals/${fresh.operationId}/draft`)).json() as {changes:{path:string;before:string|null}[]};
    assert.equal(data.changes.length,3);assert.equal(data.changes.find(c=>c.path.endsWith(`article-${fresh.operationId.slice(0,8)}.md`))!.before,null);
    const rebuild={operationId:randomUUID(),revision:await revision(),proposalId:fresh.operationId};
    assert.equal((await owner.post('/api/sites/alpha/editor/rebuild',rebuild)).status,201);
    assert.equal((await completed(rebuild.operationId)).candidate_digest,(await completed(fresh.operationId)).candidate_digest,'rebuild keeps exact source and output');
  });
  await t.test('the actual Workers engine generates contact forms and only human-approved publication enables receipt',async()=>{
    const proposal=randomUUID();
    const submitted=await owner.post('/api/sites/alpha/proposals',{operationId:proposal,revision:await revision(),commit:nativeContact,message:'Enable native inquiries'});
    assert.equal(submitted.status,201);
    const built=await completed(proposal);assert.equal(built.status,'ready',JSON.stringify(built));
    const digest=String(built.candidate_digest),manifest=JSON.parse(await (await bucket.get(`manifests/${digest}`))!.text());
    assert.deepEqual(manifest.contact,{schema:1,page:'contact.html'});
    const send=()=>fetchPublic('/alpha/_contact',{method:'POST',headers:{Origin:PUBLIC,'Content-Type':'application/json'},
      body:JSON.stringify({request_id:randomUUID(),email:'pipeline@example.test',subject:'Pipeline inquiry',body:'Actual engine output',consent:true})});
    assert.equal((await send()).status,404);
    const preview=await owner.post(`/api/sites/alpha/proposals/${proposal}/preview`,{}),ticket=await preview.json() as {url:string};
    const page=await publicWorker.fetch(ticket.url+'contact.html');assert.equal(page.status,200);
    assert.match(await page.text(),/data-sorane-contact/);
    assert.match(page.headers.get('Content-Security-Policy')!,/connect-src 'none'/);
    assert.equal((await publisher.post(`/api/sites/alpha/proposals/${proposal}/approve`,{operationId:randomUUID(),revision:await revision(),commit:nativeContact,candidate:digest})).status,201);
    const live=await fetchPublic('/alpha/contact.html');assert.match(await live.text(),/action="\/alpha\/_contact"/);
    const received=await send();assert.equal(received.status,201,await received.clone().text());
    const inbox=await owner.get('/api/sites/alpha/inquiries');assert.equal((await inbox.json() as any).inquiries[0].subject,'Pipeline inquiry');
  });
});
