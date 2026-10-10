import { receiveContact } from "./contact.ts";

/** A same-origin API alongside Pages; no static content or admin cookies here. */
export default {
  async fetch(request, env): Promise<Response> {
    const headers = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"};
    const error = (status:number) => Response.json({error:status===404?"not_found":"service_unavailable"},{status,headers});
    try {
      const url = new URL(request.url), site = String(env.CONTACT_SITE_ID);
      const origins: unknown = JSON.parse(env.CONTACT_ORIGINS);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(site) || !Array.isArray(origins) || !origins.length || origins.length>8 ||
        origins.some(value => typeof value!=="string" || new URL(value).origin!==value || !value.startsWith("https://"))) return error(503);
      if (!origins.includes(url.origin) || url.pathname!=="/_contact" || url.search) return error(404);
      if (request.method!=="POST") return new Response(null,{status:405,headers:{...headers,Allow:"POST"}});
      const policy = await env.DB.withSession("first-primary").prepare(`SELECT policy_digest FROM pages_contact_publication
        WHERE site_id=? AND origin=? AND enabled=1 AND EXISTS(SELECT 1 FROM site_member WHERE site_id=? AND role='owner')`)
        .bind(site,url.origin,site).first<{policy_digest:string}>();
      if (!policy || !/^[0-9a-f]{64}$/.test(policy.policy_digest)) return error(404);
      return await receiveContact(request,{DB:env.DB,PUBLIC_ORIGIN:url.origin},site,policy.policy_digest,"pages");
    } catch {return error(503);}
  },
} satisfies ExportedHandler<SoranePagesContactEnv>;
