import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

// Operator-only, reviewed deployment activation. This command emits SQL and
// never deploys, contacts Cloudflare, or grants a browser publication privilege.
const {values} = parseArgs({options:{
  site:{type:"string"},origin:{type:"string",multiple:true},deployment:{type:"string"},
  form:{type:"string"},actor:{type:"string"},reason:{type:"string"},disable:{type:"boolean",default:false},
}});
function required(name:"site"|"deployment"|"form"|"actor"|"reason",max=255):string {
  const value=values[name];
  if (!value || value.length>max || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`Invalid --${name}`);
  return value;
}
const site=required("site",63),deployment=required("deployment"),actor=required("actor"),reason=required("reason",1000);
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(site) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(deployment))
  throw new Error("Use the exact site and Pages deployment UUID");
const origins=values.origin;
if (!origins?.length || origins.length>8 || new Set(origins).size!==origins.length) throw new Error("Supply 1–8 distinct --origin values");
for (const value of origins) {
  const url=new URL(value);
  if (url.origin!==value || url.protocol!=="https:") throw new Error("Origins must be canonical HTTPS origins");
}
const bytes=readFileSync(required("form",4096));
if (!values.disable && !/<form\b[^>]*data-sorane-contact\b[^>]*action="\/_contact"/.test(bytes.toString("utf8")))
  throw new Error("The Pages build must contain the generated same-origin contact form");
const formDigest=createHash("sha256").update(bytes).digest("hex"),enabled=values.disable?0:1;
const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
for (const origin of origins) {
  const id=randomUUID(),policy=createHash("sha256").update(JSON.stringify({site,origin,deployment,formDigest,enabled})).digest("hex");
  console.log(`INSERT INTO pages_contact_event(id,site_id,origin,deployment_id,form_digest,policy_digest,enabled,actor,reason,created_at)
VALUES(${quote(id)},${quote(site)},${quote(origin)},${quote(deployment)},${quote(formDigest)},${quote(policy)},${enabled},${quote(actor)},${quote(reason)},
CASE WHEN ${enabled}=0 OR EXISTS(SELECT 1 FROM site_member WHERE site_id=${quote(site)} AND role='owner') THEN unixepoch() ELSE NULL END);
INSERT INTO pages_contact_publication(origin,site_id,event_id,deployment_id,form_digest,policy_digest,enabled,published_at)
VALUES(${quote(origin)},${quote(site)},${quote(id)},${quote(deployment)},${quote(formDigest)},${quote(policy)},${enabled},unixepoch())
ON CONFLICT(origin) DO UPDATE SET site_id=excluded.site_id,event_id=excluded.event_id,deployment_id=excluded.deployment_id,
form_digest=excluded.form_digest,policy_digest=excluded.policy_digest,enabled=excluded.enabled,published_at=excluded.published_at;`);
}
