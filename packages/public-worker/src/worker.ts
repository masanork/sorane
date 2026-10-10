import { createHash } from "node:crypto";
import { POLICY, type Manifest } from "../../ssg-worker/src/manifest.ts";
import { safePath, sha256 } from "../../ssg-worker/src/artifacts.ts";
import { receiveContact } from "./contact.ts";

const SHA256 = /^[0-9a-f]{64}$/, SITE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function notModified(value:string|null,digest:string):boolean {
  let rest=value?.trim()??"", matched=false;
  if (rest==="*") return true;
  // RFC 9110 §13.1.2 uses weak comparison for GET/HEAD. Cloudflare can
  // weaken the strong ETag when compressing the response on the wire.
  while (rest) {
    const tag=/^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/.exec(rest)?.[0];
    if (!tag) return false;
    matched ||= tag.replace(/^W\//,"")===`"${digest}"`;
    rest=rest.slice(tag.length).trimStart();
    if (!rest) return matched;
    if (!rest.startsWith(",")) return false;
    rest=rest.slice(1).trimStart();
  }
  return false;
}
function headers(preview = false, contact = false): Headers {
  return new Headers({"Cache-Control":preview?"no-store":"public, max-age=0, must-revalidate",
    "X-Content-Type-Options":"nosniff","Referrer-Policy":preview?"no-referrer":"same-origin",
    "Content-Security-Policy":`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src ${preview ? "'none'" : "'self'"}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action ${!preview && contact ? "'self'" : "'none'"}`,
    "Permissions-Policy":"camera=(), microphone=(), geolocation=()", ...(preview?{"X-Robots-Tag":"noindex, nofollow"}:{})});
}
function error(status:number): Response { return new Response(status===404?"Not found":"Service unavailable",{status,headers:headers(true)}); }
export default {
  async fetch(request,env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== env.PUBLIC_ORIGIN) return error(400);
      const parts = url.pathname.slice(1).split("/");
      const preview = parts[0] === "preview";
      const contactRequest = !preview && parts.length === 2 && parts[1] === "_contact";
      if (!['GET','HEAD'].includes(request.method) && !(contactRequest && request.method === "POST"))
        return new Response("Method not allowed",{status:405,headers:{Allow:contactRequest?"POST":"GET, HEAD","Cache-Control":"no-store"}});
      let digest: string|null, siteId: string, path: string;
      if (preview) {
        const [,proposal,token,...rest] = parts;
        if (!UUID.test(proposal??"") || !/^[0-9a-f-]{72}$/.test(token??"")) return error(404);
        const timestamp = Math.floor(Date.now()/1000);
        const ticket = await env.DB.withSession("first-primary").prepare(`SELECT t.candidate_digest,p.site_id FROM preview_ticket t
          JOIN proposal p ON p.id=t.proposal_id JOIN site_member m ON m.site_id=p.site_id AND m.sub=t.actor_sub
          JOIN rp_session rs ON rs.token_hash=t.session_hash AND rs.sub=t.actor_sub
          WHERE t.token_hash=? AND t.proposal_id=? AND t.expires_at>? AND rs.lease_until>? AND rs.idle_expires_at>? AND rs.parent_expires_at>?`)
          .bind(createHash("sha256").update(token).digest("base64url"),proposal,timestamp,timestamp,timestamp,timestamp)
          .first<{candidate_digest:string;site_id:string}>();
        if (!ticket) return error(404);
        digest=ticket.candidate_digest;siteId=ticket.site_id;path=rest.join("/");
      } else {
        siteId=parts.shift()??"";path=parts.join("/");
        if (!SITE.test(siteId)) return error(404);
        digest=await env.DB.withSession("first-primary").prepare("SELECT candidate_digest FROM site_publication WHERE site_id=?")
          .bind(siteId).first<string>("candidate_digest");
      }
      if (!digest || !SHA256.test(digest)) return error(404);
      try {path=decodeURIComponent(path);} catch {return error(400);}
      if (!path || path.endsWith("/")) path+="index.html";
      if (!safePath(path) || ["_headers","_redirects"].includes(path)) return error(404);
      const object=await env.BUILDS.get(`manifests/${digest}`);
      if (!object || object.size>262144) return error(503);
      const text=await object.text();
      if (sha256(text)!==digest) return error(503);
      const manifest=JSON.parse(text) as Manifest;
      if (manifest.schema!==1 || manifest.policy!==POLICY || !SHA256.test(manifest.engine) ||
        (manifest.draft!==undefined && (manifest.draft?.schema!==1 || !SHA256.test(manifest.draft.digest))) ||
        manifest.baseUrl!==`${env.PUBLIC_ORIGIN}/${siteId}/` || !Array.isArray(manifest.files) || manifest.files.length>256) return error(503);
      const contactEnabled = manifest.contact?.schema === 1 && typeof manifest.contact.page === "string" &&
        safePath(manifest.contact.page) && manifest.files.some((f)=>f.path===manifest.contact!.page && f.type==="text/html; charset=utf-8");
      if (contactRequest) {
        if (request.method !== "POST") return new Response("Method not allowed",{status:405,headers:{Allow:"POST","Cache-Control":"no-store"}});
        if (!contactEnabled) return error(404);
        return await receiveContact(request,env,siteId,digest);
      }
      const file=manifest.files.find((f)=>f.path===path);
      if (!file) return error(404);
      if (!SHA256.test(file.digest) || !Number.isSafeInteger(file.bytes) || file.bytes<0 || file.bytes>1048576 ||
        typeof file.type!=="string" || /[\r\n]/.test(file.type)) return error(503);
      const blob=await env.BUILDS.get(`blobs/${file.digest}`);
      if (!blob || blob.size!==file.bytes) return error(503);
      const bytes=new Uint8Array(await blob.arrayBuffer());
      if (sha256(bytes)!==file.digest) return error(503);
      const responseHeaders=headers(preview,contactEnabled);
      responseHeaders.set("Content-Type",file.type);responseHeaders.set("ETag",`"${file.digest}"`);
      responseHeaders.set("X-Sorane-Candidate",digest);
      if (file.type==="application/octet-stream") responseHeaders.set("Content-Disposition","attachment");
      if (notModified(request.headers.get("If-None-Match"),file.digest)) return new Response(null,{status:304,headers:responseHeaders});
      return new Response(request.method==="HEAD"?null:bytes,{headers:responseHeaders});
    } catch {return error(503);}
  },
} satisfies ExportedHandler<SoranePublicEnv>;
