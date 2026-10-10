import { build } from "esbuild";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, now, COMMIT } from "./admin-fixture.ts";
import { runBuild } from "../../packages/core/src/build.ts";
import { mergeConfig } from "../../packages/core/src/config.ts";
import { contentType } from "../../packages/ssg-worker/src/content-type.ts";

export const PUBLIC = "https://public.sorane.example";
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
// Publication seeding is test-only. It uses the real SSG output, D1 schema,
// R2 objects and public/admin Worker handlers, with a local signed OIDC fixture.
export async function contactFixture(t: Pick<import("node:test").TestContext,"after">, output?: string, origin?: string) {
  const bundled = await build({entryPoints:[new URL("../../packages/public-worker/src/worker.ts",import.meta.url).pathname],
    bundle:true,write:false,format:"esm",platform:"node",target:"es2023"});
  const pages = await build({entryPoints:[new URL("../../packages/public-worker/src/pages-contact.ts",import.meta.url).pathname],
    bundle:true,write:false,format:"esm",platform:"node",target:"es2023"});
  const f = await fixture(t,{origin,engine:"e".repeat(64),bucket:"contact-bucket",workers:[{
    name:"public",routes:[PUBLIC+"/*"],modules:true,script:bundled.outputFiles[0].text,compatibilityDate:"2026-10-08",
    compatibilityFlags:["nodejs_compat","disallow_importable_env"],d1Databases:{DB:"pipeline-db"},
    r2Buckets:{BUILDS:"contact-bucket"},bindings:{PUBLIC_ORIGIN:PUBLIC},
  },{
    name:"pages-contact",routes:["https://pages.sorane.example/*"],modules:true,script:pages.outputFiles[0].text,
    compatibilityDate:"2026-10-10",compatibilityFlags:["nodejs_compat","disallow_importable_env"],
    d1Databases:{DB:"pipeline-db"},bindings:{CONTACT_SITE_ID:"native",CONTACT_ORIGINS:JSON.stringify([PUBLIC])},
  }]});
  await f.seedSite("native",{owner:"owner",editor:"editor",publisher:"publisher",viewer:"viewer"});
  if (!output) {
    const root = mkdtempSync(join(tmpdir(),"sorane-contact-"));
    t.after(()=>rmSync(root,{recursive:true,force:true}));
    mkdirSync(join(root,"content"));
    writeFileSync(join(root,"content/index.md"),"---\ntype: index\ntitle: Contact fixture\n---\n\nWelcome.");
    writeFileSync(join(root,"content/contact.md"),"---\ntype: article\ntitle: Contact\n---\n\nAsk a question.");
    output = join(root,"dist");
    await runBuild({cwd:root,config:mergeConfig({site:{title:"Contact fixture",description:"Tests",lang:"ja",
      base_url:PUBLIC+"/native/",contact:{page:"contact.html",form:{enabled:true}}},
      build:{content_dir:"content",out_dir:output,permalink:"{{slug}}.html"}}),clean:true});
  }
  const bucket = await f.mf.getR2Bucket("BUILDS","public"), files: {path:string;digest:string;bytes:number;type:string}[] = [];
  async function upload(dir: string, prefix="") {
    for (const entry of readdirSync(dir,{withFileTypes:true})) {
      const path = prefix+entry.name, absolute = join(dir,entry.name);
      if (entry.isDirectory()) await upload(absolute,path+"/");
      else {
        const bytes = readFileSync(absolute), hash = digest(bytes);
        await bucket.put(`blobs/${hash}`,bytes);
        files.push({path,digest:hash,bytes:bytes.length,type:contentType(path)});
      }
    }
  }
  await upload(output);
  const proposal = randomUUID(), approval = randomUUID();
  await f.db.batch([
    f.db.prepare("INSERT INTO admin_operation(id,site_id,actor_sub,action,payload,site_revision,created_at) VALUES(?,'native','owner','proposal.submit','{}',1,?)").bind(proposal,now()),
    f.db.prepare("INSERT INTO proposal(id,site_id,commit_id,message,submitted_by,created_at,state) VALUES(?,'native',?,'Fixture','owner',?,'approved')").bind(proposal,COMMIT,now()),
    f.db.prepare("INSERT INTO admin_operation(id,site_id,actor_sub,action,payload,site_revision,created_at) VALUES(?,'native','owner','proposal.approve','{}',1,?)").bind(approval,now()),
    f.db.prepare("INSERT INTO publication_approval(id,proposal_id,site_id,commit_id,approved_by,approved_at) VALUES(?,?,'native',?,'owner',?)").bind(approval,proposal,COMMIT,now()),
  ]);
  async function publish(enabled=true) {
    const manifest = {schema:1,policy:"sorane-workers-content-v1",engine:"e".repeat(64),repository:"fixture",
      commit:COMMIT,tree:COMMIT,baseUrl:PUBLIC+"/native/",files,...(enabled?{contact:{schema:1,page:"contact.html"}}:{})};
    const text = JSON.stringify(manifest), candidate = digest(text);
    await bucket.put(`manifests/${candidate}`,text);
    await f.db.prepare(`INSERT INTO site_publication(site_id,approval_id,proposal_id,candidate_digest,published_at)
      VALUES('native',?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET candidate_digest=excluded.candidate_digest`)
      .bind(approval,proposal,candidate,now()).run();
    return candidate;
  }
  const candidate = await publish(), publicWorker = await f.mf.getWorker("public");
  const pagesEvent=randomUUID(),deployment=randomUUID();
  await f.db.batch([
    f.db.prepare("INSERT INTO pages_contact_event VALUES(?,'native',?,?,?, ?,1,'fixture','E2E Pages publication',?)")
      .bind(pagesEvent,PUBLIC,deployment,"f".repeat(64),"c".repeat(64),now()),
    f.db.prepare("INSERT INTO pages_contact_publication VALUES(?,'native',?,?,?,?,1,?)")
      .bind(PUBLIC,pagesEvent,deployment,"f".repeat(64),"c".repeat(64),now()),
  ]);
  await f.db.prepare("INSERT INTO build_job(proposal_id,status,candidate_digest,engine_id,file_count,total_bytes) VALUES(?,'ready',?,?,?,?)")
    .bind(proposal,candidate,"e".repeat(64),files.length,files.reduce((sum,file)=>sum+file.bytes,0)).run();
  return Object.assign(f,{publicWorker,pagesWorker:await f.mf.getWorker("pages-contact"),publish,bucket,proposal,candidate});
}
