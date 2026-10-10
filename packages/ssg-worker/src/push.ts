import { createHash } from "node:crypto";

import { pushSources } from "../scripts/push-sources.ts";
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;

/** Only the configured Queue transport can reach this; there is no HTTP event route. */
export async function admitPush(value:unknown,env:SoraneBuildEnv):Promise<string|null> {
  const sources=pushSources(env.ARTIFACTS_PUSH_SOURCES), event=record(value);
  if(!event||event.type!=='cf.artifacts.repo.pushed')return null;
  const source=record(event.source), payload=record(event.payload), metadata=record(event.metadata);
  if(!source||!payload||!metadata||source.type!=='artifacts.repo'||source.namespace!==env.ARTIFACTS_NAMESPACE||
    metadata.eventSchemaVersion!==1||typeof payload.after!=='string'||!/^[0-9a-f]{40}$/.test(payload.after)||/^0+$/.test(payload.after)||
    typeof metadata.eventTimestamp!=='string'||metadata.eventTimestamp.length>40)return null;
  const timestamp=Date.parse(metadata.eventTimestamp);
  const target=sources.find(s=>s.repository===source.repoName&&s.ref===payload.ref&&s.accountId===metadata.accountId&&s.subscriptionId===metadata.eventSubscriptionId);
  if(!target||!Number.isFinite(timestamp)||timestamp<target.enabledAt*1000||timestamp>Date.now()+300000)return null;
  using repo=await env.ARTIFACTS.get(target.repository);
  const info=await repo.info();
  if(info.id!==target.repositoryId||info.name!==target.repository)throw new Error('repository_identity_mismatch');
  const commit=await repo.readCommit(payload.after);
  if(!commit||commit.hash!==payload.after)return null;
  const actor=`artifacts:${target.subscriptionId}`, now=Math.floor(Date.now()/1000);
  const input=JSON.stringify({site:target.site,namespace:env.ARTIFACTS_NAMESPACE,repository:target.repository,repositoryId:target.repositoryId,ref:target.ref,commit:payload.after});
  const hex=createHash('sha256').update('sorane-artifacts-push-v1\0'+input).digest('hex').slice(0,32);
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  const db=env.DB.withSession('first-primary');
  const admitted=`EXISTS(SELECT 1 FROM admin_operation o JOIN site s ON s.id=o.site_id
    WHERE o.id=? AND o.site_id=? AND o.actor_kind='artifacts' AND o.actor_sub=? AND o.action='proposal.submit'
    AND o.payload=? AND s.revision=o.site_revision)`;
  const proof=[id,target.site,actor,input];
  await db.batch([
    db.prepare(`INSERT INTO admin_operation(id,site_id,actor_sub,action,payload,site_revision,created_at,actor_kind)
      SELECT ?,s.id,?,'proposal.submit',?,s.revision,?,'artifacts' FROM site s
      WHERE s.id=? AND s.artifact_namespace=? AND s.artifact_repository=? AND s.revision<9007199254740991
      AND NOT EXISTS(SELECT 1 FROM artifact_push WHERE site_id=s.id AND repository_id=? AND ref=? AND commit_id=?)
      ON CONFLICT(id) DO NOTHING`).bind(id,actor,input,now,target.site,env.ARTIFACTS_NAMESPACE,target.repository,target.repositoryId,target.ref,payload.after),
    db.prepare(`INSERT INTO proposal(id,site_id,commit_id,message,submitted_by,created_at,expected_repository_id)
      SELECT ?,?,?,?,?,?,? WHERE ${admitted} AND NOT EXISTS(SELECT 1 FROM artifact_push WHERE proposal_id=?)`)
      .bind(id,target.site,payload.after,`Artifacts push: ${target.ref}`,actor,now,target.repositoryId,...proof,id),
    db.prepare(`INSERT INTO build_job(proposal_id) SELECT ? WHERE ${admitted} AND NOT EXISTS(SELECT 1 FROM artifact_push WHERE proposal_id=?)`).bind(id,...proof,id),
    db.prepare(`INSERT INTO artifact_push(proposal_id,site_id,repository_id,ref,commit_id,subscription_id,event_timestamp)
      SELECT ?,?,?,?,?,?,? WHERE ${admitted} AND NOT EXISTS(SELECT 1 FROM artifact_push WHERE proposal_id=?)`)
      .bind(id,target.site,target.repositoryId,target.ref,payload.after,target.subscriptionId,metadata.eventTimestamp,...proof,id),
    db.prepare(`UPDATE site SET revision=revision+1 WHERE id=? AND ${admitted}`).bind(target.site,...proof),
  ]);
  const receipt=await db.prepare('SELECT proposal_id FROM artifact_push WHERE site_id=? AND repository_id=? AND ref=? AND commit_id=?')
    .bind(target.site,target.repositoryId,target.ref,payload.after).first<string>('proposal_id');
  return receipt;
}
