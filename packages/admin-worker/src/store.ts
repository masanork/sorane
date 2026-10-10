import { fail, now, type Session } from "../vendor/mikaki/oidc.ts";
import { draftDigest, type ContentDraft } from '../../ssg-worker/src/draft-input.ts';

export const ROLES = ["viewer", "editor", "publisher", "owner"] as const;
export type Role = typeof ROLES[number];
export type Action = "member.set" | "member.remove" | "proposal.submit" | "proposal.approve";
const allowed: Record<Action, readonly Role[]> = {
  "member.set": ["owner"], "member.remove": ["owner"],
  "proposal.submit": ["owner", "editor"], "proposal.approve": ["owner", "publisher"],
};
export interface Site {
  id: string; title: string; artifact_namespace: string; artifact_repository: string;
  revision: number; role: Role;
}
export interface Proposal {
  source: 'human'|'artifacts';
  id: string; commit_id: string; message: string; submitted_by: string;
  state: "submitted" | "approved"; created_at: number;
  approved_by: string | null; approved_at: number | null;
  build_status: "queued" | "building" | "ready" | "failed" | null;
  candidate_digest: string | null; engine_id: string | null; build_error: string | null;
  file_count: number | null; total_bytes: number | null;
  validation_report: string | null;
  draft_digest: string | null;
}
interface Operation {
  id: string; site_id: string; actor_sub: string; action: Action; payload: string;
  site_revision: number; created_at: number;
}

export async function checkInstance(env: SoraneAdminEnv): Promise<void> {
  const instance = await env.DB.withSession("first-primary")
    .prepare("SELECT issuer,client_id,rp_origin FROM admin_instance WHERE singleton=1")
    .first<{ issuer: string; client_id: string; rp_origin: string }>();
  if (!instance || instance.issuer !== env.ISSUER || instance.client_id !== env.CLIENT_ID ||
    instance.rp_origin !== env.RP_ORIGIN) fail(503, "admin_not_configured");
}

export async function listSites(env: SoraneAdminEnv, sub: string): Promise<Site[]> {
  return (await env.DB.withSession("first-primary").prepare(
    "SELECT s.*,m.role FROM site s JOIN site_member m ON m.site_id=s.id WHERE m.sub=? ORDER BY s.id",
  ).bind(sub).all<Site>()).results;
}
export async function getSite(env: SoraneAdminEnv, siteId: string, sub: string): Promise<Site> {
  const site = await env.DB.withSession("first-primary").prepare(
    "SELECT s.*,m.role FROM site s JOIN site_member m ON m.site_id=s.id WHERE s.id=? AND m.sub=?",
  ).bind(siteId, sub).first<Site>();
  if (!site) fail(404, "site_not_found");
  return site;
}
export async function siteDetails(env: SoraneAdminEnv, site: Site) {
  const db = env.DB.withSession("first-primary");
  const members = site.role === "owner" ? (await db.prepare(
    "SELECT sub,role FROM site_member WHERE site_id=? ORDER BY sub",
  ).bind(site.id).all<{ sub: string; role: Role }>()).results : [];
  const proposals = (await db.prepare(
    "SELECT p.*,o.actor_kind AS source,d.digest AS draft_digest,a.approved_by,a.approved_at,b.status AS build_status,b.candidate_digest,b.engine_id,b.error AS build_error,b.file_count,b.total_bytes,b.report AS validation_report FROM proposal p JOIN admin_operation o ON o.id=p.id LEFT JOIN publication_approval a ON a.proposal_id=p.id LEFT JOIN build_job b ON b.proposal_id=p.id LEFT JOIN proposal_draft d ON d.proposal_id=p.id WHERE p.site_id=? ORDER BY p.created_at DESC,p.id LIMIT 100",
  ).bind(site.id).all<Proposal>()).results;
  const publication = await db.prepare("SELECT * FROM site_publication WHERE site_id=?").bind(site.id).first();
  return { site, members, proposals, publication };
}
export function can(role: Role, action: Action): boolean { return allowed[action].includes(role); }

/** Guard permissions, the RP lease, the site revision, state and audit in one D1 batch. */
export async function mutate(
  env: SoraneAdminEnv, session: Session, site: Site, action: Action,
  input: { operationId: string; revision: number; sub?: string; role?: Role; commit?: string; message?: string; proposalId?: string; candidate?: string; draft?:ContentDraft },
): Promise<{ operation: Operation; replay: boolean }> {
  if (!can(site.role, action)) fail(403, "permission_denied");
  const db = env.DB.withSession("first-primary");
  const {draft,...fields}=input;
  if (draft && action!=='proposal.submit') fail(400,'invalid_content_draft');
  // Keep the audit compact; the separately retained immutable data is bound by
  // its digest. Reordering changes is an exact canonical retry.
  const digest=draft?await draftDigest(draft):undefined;
  const payload = JSON.stringify({...fields,...(draft?{draft:{digest,repository:draft.repository}}:{})});
  const find = () => db.prepare("SELECT * FROM admin_operation WHERE id=?")
    .bind(input.operationId).first<Operation>();
  const same = (operation: Operation) => {
    if (operation.site_id !== site.id || operation.actor_sub !== session.sub ||
      operation.action !== action || operation.payload !== payload) fail(409, "operation_conflict");
    return { operation, replay: true };
  };
  const prior = await find();
  if (prior) return same(prior);

  const timestamp = now();
  let guard = "";
  const parameters: (string | number | null)[] = [];
  const changes: D1PreparedStatement[] = [];
  // A racing request may insert this operation ID after our initial lookup while
  // this admission SELECT produces zero rows (e.g. a stale revision). Matching
  // only the ID would then execute unaudited effects. Bind the whole operation
  // and its still-current revision; a committed retry has already advanced it.
  const admitted = `EXISTS(SELECT 1 FROM admin_operation o JOIN site s ON s.id=o.site_id
    WHERE o.id=? AND o.site_id=? AND o.actor_sub=? AND o.action=? AND o.payload=?
    AND o.site_revision=? AND s.revision=o.site_revision)`;
  const proof = [input.operationId, site.id, session.sub, action, payload, input.revision];
  if (action === "member.set" || action === "member.remove") {
    // Preserve an owner when replacing/removing any current owner. This is checked
    // against live membership inside the serialized batch, including concurrent demotions.
    guard = " AND (NOT EXISTS(SELECT 1 FROM site_member WHERE site_id=s.id AND sub=? AND role='owner') OR ?='owner' OR EXISTS(SELECT 1 FROM site_member WHERE site_id=s.id AND role='owner' AND sub<>?))";
    parameters.push(input.sub!, action === "member.set" ? input.role! : "", input.sub!);
    if (action === "member.set") {
      changes.push(db.prepare(
        `INSERT INTO site_member(site_id,sub,role) SELECT ?,?,? WHERE ${admitted} ON CONFLICT(site_id,sub) DO UPDATE SET role=excluded.role`,
      ).bind(site.id, input.sub!, input.role!, ...proof));
    } else {
      changes.push(db.prepare(`DELETE FROM site_member WHERE site_id=? AND sub=? AND ${admitted}`)
        .bind(site.id, input.sub!, ...proof));
    }
  } else if (action === "proposal.submit") {
    changes.push(db.prepare(
      `INSERT INTO proposal(id,site_id,commit_id,message,submitted_by,created_at,expected_repository_id,draft_digest) SELECT ?,?,?,?,?,?,?,? WHERE ${admitted}`,
    ).bind(input.operationId, site.id, input.commit!, input.message!, session.sub, timestamp, draft?.repository??null, digest??null, ...proof));
    if (draft) changes.push(db.prepare(`INSERT INTO proposal_draft(proposal_id,digest,payload) SELECT ?,?,? WHERE ${admitted}`)
      .bind(input.operationId,digest!,JSON.stringify(draft),...proof));
    changes.push(db.prepare(`INSERT INTO build_job(proposal_id) SELECT ? WHERE ${admitted}`)
      .bind(input.operationId, ...proof));
  } else {
    guard = " AND EXISTS(SELECT 1 FROM proposal p JOIN build_job b ON b.proposal_id=p.id WHERE p.id=? AND p.site_id=s.id AND p.commit_id=? AND p.state='submitted' AND b.status='ready' AND b.candidate_digest=? AND b.engine_id=?)";
    parameters.push(input.proposalId!, input.commit!, input.candidate!, env.EXPECTED_ENGINE);
    changes.push(db.prepare(
      `INSERT INTO publication_approval(id,proposal_id,site_id,commit_id,approved_by,approved_at,candidate_digest,tree_hash,engine_id)
       SELECT ?,p.id,?,?,?,?,b.candidate_digest,b.tree_hash,b.engine_id FROM proposal p JOIN build_job b ON b.proposal_id=p.id WHERE p.id=? AND ${admitted}`,
    ).bind(input.operationId, site.id, input.commit!, session.sub, timestamp, input.proposalId!, ...proof));
    changes.push(db.prepare(`UPDATE proposal SET state='approved' WHERE id=? AND site_id=? AND ${admitted}`)
      .bind(input.proposalId!, site.id, ...proof));
    changes.push(db.prepare(`INSERT INTO site_publication(site_id,approval_id,proposal_id,candidate_digest,published_at)
      SELECT ?,?,?,?,? WHERE ${admitted} ON CONFLICT(site_id) DO UPDATE SET approval_id=excluded.approval_id,
        proposal_id=excluded.proposal_id,candidate_digest=excluded.candidate_digest,published_at=excluded.published_at`)
      .bind(site.id,input.operationId,input.proposalId!,input.candidate!,timestamp,...proof));
  }
  const placeholders = allowed[action].map(() => "?").join(",");
  const admission = db.prepare(
    `INSERT INTO admin_operation(id,site_id,actor_sub,action,payload,site_revision,created_at)
     SELECT ?,s.id,?,?,?,?,? FROM site s JOIN site_member m ON m.site_id=s.id
     JOIN rp_session rs ON rs.sub=m.sub AND rs.token_hash=?
     WHERE s.id=? AND s.revision=? AND m.sub=? AND m.role IN (${placeholders})
     AND rs.lease_until>? AND rs.idle_expires_at>? AND rs.parent_expires_at>? ${guard}`,
  ).bind(input.operationId, session.sub, action, payload, input.revision, timestamp,
    session.token_hash, site.id, input.revision, session.sub, ...allowed[action],
    timestamp, timestamp, timestamp, ...parameters);
  changes.push(db.prepare(`UPDATE site SET revision=revision+1 WHERE id=? AND ${admitted}`)
    .bind(site.id, ...proof));
  try {
    const result = await db.batch([admission, ...changes]);
    if (result[0].meta.changes !== 1) fail(409, "site_or_authority_changed");
  } catch (error) {
    // An identical request may have won the race, including a lost first response.
    const concurrent = await find();
    if (concurrent) return same(concurrent);
    throw error;
  }
  const operation = await find();
  if (!operation) fail(503, "operation_unconfirmed");
  return { operation, replay: false };
}
