import { fail, hash, now, random, type Session } from "../vendor/mikaki/oidc.ts";
import type { Site } from "./store.ts";

/** Durable outbox: lost Queue send replies only cause harmless duplicate builds. */
export async function enqueueBuilds(env: SoraneAdminEnv): Promise<void> {
  const db=env.DB.withSession("first-primary");
  const jobs=await db.prepare(`UPDATE build_job SET enqueued_at=? WHERE proposal_id IN
    (SELECT proposal_id FROM build_job WHERE (status='queued' OR (status='building' AND lease_until<=?)) AND enqueued_at<? LIMIT 10)
    RETURNING proposal_id`).bind(now(),now(),now()-60).all<{proposal_id:string}>();
  for (const job of jobs.results) await env.BUILD_QUEUE.send({proposalId:job.proposal_id});
}
export async function preview(env: SoraneAdminEnv,session:Session,site:Site,proposalId:string) {
  const origin=new URL(env.PUBLIC_ORIGIN);
  if (origin.origin!==env.PUBLIC_ORIGIN || origin.protocol!=="https:" || origin.origin===String(env.RP_ORIGIN)) fail(503,"invalid_public_origin");
  const token=random(), expiry=Math.min(now()+60,session.lease_until,session.idle_expires_at,session.parent_expires_at);
  const ticket=await env.DB.withSession("first-primary").prepare(`INSERT INTO preview_ticket(token_hash,proposal_id,candidate_digest,session_hash,actor_sub,expires_at)
    SELECT ?,p.id,b.candidate_digest,rs.token_hash,m.sub,? FROM proposal p JOIN build_job b ON b.proposal_id=p.id
    JOIN site_member m ON m.site_id=p.site_id JOIN rp_session rs ON rs.sub=m.sub
    WHERE p.id=? AND p.site_id=? AND b.status='ready' AND m.sub=? AND rs.token_hash=?
    AND rs.lease_until>? AND rs.idle_expires_at>? AND rs.parent_expires_at>?`)
    .bind(await hash(token),expiry,proposalId,site.id,session.sub,session.token_hash,now(),now(),now()).run();
  if (ticket.meta.changes!==1) fail(409,"preview_or_authority_changed");
  return {url:`${env.PUBLIC_ORIGIN}/preview/${proposalId}/${token}/`,expires_at:expiry};
}
