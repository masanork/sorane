import { readSource } from "./artifacts.ts";
import { buildSource, ENGINE_ID } from "./build.ts";
import { admitPush } from "./push.ts";
import { contentDraft, draftDigest } from './draft-input.ts';
export { ContentSource } from './source-reader.ts';
const now = () => Math.floor(Date.now()/1000);
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const reasons = new Set(["artifacts_requires_sha1_commit","repository_identity_mismatch","commit_not_found","source_depth_limit",
  "tree_not_found","invalid_source_tree","invalid_source_path","source_file_limit","source_size_limit","blob_hash_mismatch","tree_hash_mismatch",
  "source_symlink_or_submodule","invalid_sorane_configuration","feature_requires_linux_build_profile","invalid_build_directory",
  "unsupported_output_layout","invalid_content_slug","redirect_requires_static_assets_profile","filesystem_path_outside_build",
  "invalid_output_path","output_size_limit","missing_site_index","source_namespace_mismatch","invalid_source_content","missing_content_directory",
  "invalid_content_draft","draft_digest_mismatch","draft_base_mismatch","draft_path_not_content",
  "invalid_contact_page","invalid_contact_base_url","invalid_contact_privacy_notice","contact_page_not_built"]);
function reportJson(report: Awaited<ReturnType<typeof buildSource>>["report"]): string {
  const full = JSON.stringify(report);
  if (new TextEncoder().encode(full).length <= 131072) return full;
  let remaining = 100;
  return JSON.stringify({...report,truncated:true,files:report.files.slice(0,64).map((file)=>({
    file:file.file.slice(0,512),ok:file.ok,type:file.type?.slice(0,64),profile:file.profile?.slice(0,64),
    findings:file.findings.slice(0,Math.min(remaining,10)).map((finding)=>{
      remaining--;return {...finding,message:finding.message.slice(0,256),instancePath:finding.instancePath?.slice(0,256)};
    }),
  }))});
}

export default {
  fetch(): Response { return new Response("Not found",{status:404}); },
  async queue(batch: MessageBatch<unknown>, env: SoraneBuildEnv): Promise<void> {
    const origin = new URL(env.PUBLIC_ORIGIN);
    if (origin.origin !== env.PUBLIC_ORIGIN || origin.protocol !== "https:") throw new Error("invalid_public_origin");
    if (batch.queue !== env.BUILD_QUEUE_NAME) throw new Error('unexpected_build_queue');
    for (const message of batch.messages) {
      const body=message.body;
      let id:unknown;
      if(body&&typeof body==='object'&&!Array.isArray(body)&&'type' in body) {
        // Admission and its outbox job commit together. A lost event reply can
        // replay the same receipt; the normal job claim prevents a second build.
        try {id=await admitPush(body,env);} catch {
          console.error(JSON.stringify({event:'artifact_push_admission_failed'}));
          message.retry({delaySeconds:30});continue;
        }
      } else id=body&&typeof body==='object'&&'proposalId' in body?body.proposalId:null;
      if (typeof id !== "string" || !UUID.test(id)) { message.ack(); continue; }
      const db = env.DB.withSession("first-primary"), attempt = crypto.randomUUID();
      const claimed = await db.prepare(`UPDATE build_job SET status='building',attempt=?,lease_until=?
        WHERE proposal_id=? AND (status='queued' OR (status='building' AND lease_until<=?)) RETURNING proposal_id`)
        .bind(attempt,now()+120,id,now()).first();
      if (!claimed) { message.ack(); continue; }
      const candidate = await db.prepare("SELECT p.commit_id,p.site_id,p.expected_repository_id,p.draft_digest AS expected_draft_digest,s.artifact_namespace,s.artifact_repository,d.payload AS draft_payload,d.digest AS draft_digest FROM proposal p JOIN site s ON s.id=p.site_id LEFT JOIN proposal_draft d ON d.proposal_id=p.id WHERE p.id=?")
        .bind(id).first<{commit_id:string;site_id:string;expected_repository_id:string|null;artifact_namespace:string;artifact_repository:string;draft_payload:string|null;draft_digest:string|null;expected_draft_digest:string|null}>();
      try {
        if (!candidate || candidate.artifact_namespace !== env.ARTIFACTS_NAMESPACE) throw new Error("source_namespace_mismatch");
        const source = await readSource(env.ARTIFACTS,candidate.artifact_repository,candidate.commit_id,candidate.expected_repository_id);
        let draft;
        if (candidate.expected_draft_digest!==candidate.draft_digest) throw new Error('draft_digest_mismatch');
        if (candidate.draft_payload!==null) {
          try {draft=contentDraft(JSON.parse(candidate.draft_payload));} catch {throw new Error('invalid_content_draft');}
          if (await draftDigest(draft)!==candidate.draft_digest) throw new Error('draft_digest_mismatch');
        }
        const result = await buildSource(source,candidate.commit_id,id,`${env.PUBLIC_ORIGIN}/${candidate.site_id}/`,env.BUILDS,draft);
        await db.prepare(`UPDATE build_job SET status=?,repository_id=?,tree_hash=?,engine_id=?,candidate_digest=?,
          file_count=?,total_bytes=?,report=?,error=?,completed_at=?,lease_until=0 WHERE proposal_id=? AND attempt=? AND status='building'`)
          .bind(result.ok?"ready":"failed",source.repositoryId,source.treeHash,ENGINE_ID,result.ok?result.digest:null,
            result.ok?result.manifest.files.length:null,result.ok?result.totalBytes:null,reportJson(result.report),
            result.ok?null:result.error,now(),id,attempt).run();
        message.ack();
      } catch (error) {
        const code = error instanceof Error && reasons.has(error.message) ? error.message : "build_service_unavailable";
        // Deterministic validation failures stop; transient read/upload failures
        // can safely retry. Neither retries a token mint or repository mutation.
        const status = code === "build_service_unavailable" && message.attempts < 3 ? "queued" : "failed";
        await db.prepare("UPDATE build_job SET status=?,error=?,lease_until=0 WHERE proposal_id=? AND attempt=? AND status='building'")
          .bind(status,code,id,attempt).run();
        console.error(JSON.stringify({event:"ssg_build_failed",proposal_id:id,code}));
        if (status === "queued") message.retry({delaySeconds:30}); else message.ack();
      }
    }
  },
} satisfies ExportedHandler<SoraneBuildEnv,unknown>;
