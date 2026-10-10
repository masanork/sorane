import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundleWorker, engineId } from "./bundle.ts";
import { pushSources } from "./push-sources.ts";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const names=["account","database-id","database-name","namespace","bucket","queue","admin-origin","public-origin","client","issuer","prefix","workers-subdomain","push-sources"];
const {values}=parseArgs({options:Object.fromEntries(names.map((name)=>[name,{type:"string" as const}]))});
function required(name:string):string {const value=values[name];if(typeof value!=="string"||!value)throw new Error(`Missing --${name}`);return value;}
function origin(name:string):string {
  const value=required(name), url=new URL(value);
  if(url.origin!==value||url.protocol!=="https:")throw new Error(`--${name} must be a canonical HTTPS origin`);
  return value;
}
const account=required("account"), database=required("database-id"), admin=origin("admin-origin"), publicOrigin=origin("public-origin");
if(!/^[0-9a-f]{32}$/.test(account))throw new Error("Invalid Cloudflare account ID");
if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(database)||/^0[-0]+$/.test(database))throw new Error("Use the actual provisioned D1 UUID");
if(admin===publicOrigin)throw new Error("Admin and generated content require separate origins");
const issuer=String(values.issuer??"https://auth.mikaki.org"), issuerUrl=new URL(issuer);
if(issuerUrl.origin!==issuer||issuerUrl.protocol!=="https:")throw new Error("Issuer must be a canonical HTTPS origin");
const prefix=String(values.prefix??"sorane-dev");
if(!/^sorane-[a-z0-9-]{1,32}$/.test(prefix))throw new Error("Use an isolated sorane-* Worker prefix");
const workersSubdomain=values["workers-subdomain"];
if(workersSubdomain!==undefined) {
  if(typeof workersSubdomain!=="string"||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(workersSubdomain))throw new Error("Invalid workers.dev subdomain");
  if(admin!==`https://${prefix}-admin.${workersSubdomain}.workers.dev`||publicOrigin!==`https://${prefix}-public.${workersSubdomain}.workers.dev`)
    throw new Error("workers.dev origins must match the Worker names and account subdomain");
}
const namespace=required("namespace"), bucket=required("bucket"), queue=required("queue"), client=required("client");
const sources=pushSources(values['push-sources']?readFileSync(String(values['push-sources']),'utf8'):'[]');
if(sources.some(source=>source.accountId!==account))throw new Error('Push sources must belong to the configured account');
for(const [name,value] of Object.entries({namespace,bucket,queue}))if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(value))throw new Error(`Invalid ${name}`);
if(client.length>255||/[\x00-\x20\x7f]/.test(client))throw new Error("Invalid registered RP client ID");
const output=join(root,".sorane/workers");mkdirSync(output,{recursive:true});
const bundle=await bundleWorker();mkdirSync(join(root,"packages/ssg-worker/dist"),{recursive:true});
writeFileSync(join(root,"packages/ssg-worker/dist/worker.mjs"),bundle.outputFiles[0].contents);
const engine=engineId(), configs:Record<string,string>={};
for(const part of ["admin","ssg","public"]) {
  const dir=join(root,`packages/${part}-worker`), config=JSON.parse(readFileSync(join(dir,"wrangler.jsonc"),"utf8"));
  config.$schema=join(root,"node_modules/wrangler/config-schema.json");
  config.name=`${prefix}-${part}`;config.account_id=account;config.main=resolve(dir,config.main);
  config.vars={...config.vars,PUBLIC_ORIGIN:publicOrigin};
  config.d1_databases=config.d1_databases.map((binding:Record<string,unknown>)=>({
    ...binding,database_id:database,database_name:required("database-name"),
    ...(binding.migrations_dir?{migrations_dir:resolve(dir,String(binding.migrations_dir))}:{}),
  }));
  if(config.r2_buckets)config.r2_buckets=config.r2_buckets.map((binding:Record<string,unknown>)=>({...binding,bucket_name:bucket}));
  if(part==="admin") {
    Object.assign(config.vars,{ISSUER:issuer,RP_ORIGIN:admin,CLIENT_ID:client,EXPECTED_ENGINE:engine});
    config.queues.producers[0].queue=queue;
    config.services[0].service=`${prefix}-ssg`;
    config.routes=workersSubdomain?[]:[{pattern:new URL(admin).hostname,custom_domain:true}];
    config.workers_dev=Boolean(workersSubdomain);
  } else if(part==="ssg") {
    Object.assign(config.vars,{ARTIFACTS_NAMESPACE:namespace,BUILD_QUEUE_NAME:queue,ARTIFACTS_PUSH_SOURCES:JSON.stringify(sources)});
    config.artifacts[0].namespace=namespace;config.queues.consumers[0].queue=queue;
  } else {
    config.routes=workersSubdomain?[]:[{pattern:new URL(publicOrigin).hostname,custom_domain:true}];
    config.workers_dev=Boolean(workersSubdomain);
  }
  const path=join(output,`${part}.jsonc`);writeFileSync(path,JSON.stringify(config,null,2)+"\n");configs[part]=path;
}
const plan={account,database,namespace,bucket,queue,admin_origin:admin,public_origin:publicOrigin,client,engine,push_sources:sources,workers_subdomain:workersSubdomain??null,configs};
writeFileSync(join(output,"plan.json"),JSON.stringify(plan,null,2)+"\n");
console.log(JSON.stringify(plan,null,2));
