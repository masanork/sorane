import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { digest, records, publicationStatements } from "../../../scripts/pages-publication.ts";

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
const next=records({site,origins,formDigest:digest(bytes.toString("utf8")),enabled:!values.disable},deployment);
for (const {sql} of publicationStatements(next,actor,reason)) console.log(sql+";");
