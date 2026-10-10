import { fail, now, type Session } from "../vendor/mikaki/oidc.ts";

export const INQUIRY_STATUSES = {new:"未対応",in_progress:"対応中",closed:"対応済み"} as const;
export type InquiryStatus = keyof typeof INQUIRY_STATUSES;
export interface Inquiry {
  id: string; name: string; email: string; subject: string; body: string;
  status: InquiryStatus; version: number; created_at: number; expires_at: number;
}
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
// Authorization belongs in each data query too: revoking an owner or session
// cannot race a prior role check to read or change personal data.
const AUTH = `EXISTS(SELECT 1 FROM site_member m JOIN rp_session r ON r.sub=m.sub
  WHERE m.site_id=? AND m.sub=? AND m.role='owner' AND r.token_hash=?
  AND r.lease_until>? AND r.idle_expires_at>? AND r.parent_expires_at>?)`;
const auth = (site: string, session: Session) => [site,session.sub,session.token_hash,now(),now(),now()];
async function owner(db: D1DatabaseSession, site: string, session: Session) {
  if (!await db.prepare(`SELECT 1 WHERE ${AUTH}`).bind(...auth(site,session)).first()) fail(403,"permission_denied");
}

export async function listInquiries(env: SoraneAdminEnv, session: Session, site: string, url: URL) {
  const db = env.DB.withSession("first-primary");
  await owner(db,site,session);
  const status = url.searchParams.get("status") || null, before = url.searchParams.get("before");
  if ((status !== null && !Object.hasOwn(INQUIRY_STATUSES,status)) || (before !== null && !UUID.test(before))) fail(400,"invalid_filter");
  const rows = await db.prepare(`SELECT id,name,email,subject,status,version,created_at,expires_at FROM contact_inquiry
    WHERE site_id=? AND expires_at>? AND ${AUTH} AND (? IS NULL OR status=?)
    AND (? IS NULL OR (created_at,id)<(SELECT created_at,id FROM contact_inquiry WHERE site_id=? AND id=?))
    ORDER BY created_at DESC,id DESC LIMIT 26`)
    .bind(site,now(),...auth(site,session),status,status,before,site,before).all<Omit<Inquiry,"body">>();
  return {inquiries:rows.results.slice(0,25),next:rows.results.length>25 ? rows.results[24].id : null};
}

export async function getInquiry(env: SoraneAdminEnv, session: Session, site: string, id: string): Promise<Inquiry> {
  if (!UUID.test(id)) fail(404,"not_found");
  const db = env.DB.withSession("first-primary");
  await owner(db,site,session);
  const row = await db.prepare(`SELECT id,name,email,subject,body,status,version,created_at,expires_at FROM contact_inquiry
    WHERE site_id=? AND id=? AND expires_at>? AND ${AUTH}`).bind(site,id,now(),...auth(site,session)).first<Inquiry>();
  if (!row) fail(404,"not_found");
  return row;
}

export async function updateInquiry(env: SoraneAdminEnv, session: Session, site: string, id: string, value: Record<string,unknown>) {
  if (!UUID.test(id)) fail(404,"not_found");
  if (Object.keys(value).some((key)=>!["status","version"].includes(key)) || typeof value.status !== "string" ||
    !Object.hasOwn(INQUIRY_STATUSES,value.status) || !Number.isSafeInteger(value.version) || Number(value.version)<1) fail(400,"invalid_input");
  const db = env.DB.withSession("first-primary");
  await owner(db,site,session);
  const timestamp = now(), event = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(`INSERT INTO contact_status_event(id,inquiry_id,actor_sub,status,version,created_at)
      SELECT ?,id,?,?,version+1,? FROM contact_inquiry WHERE site_id=? AND id=? AND version=? AND expires_at>? AND ${AUTH}`)
      .bind(event,session.sub,value.status,timestamp,site,id,value.version,timestamp,...auth(site,session)),
    db.prepare(`UPDATE contact_inquiry SET status=?,version=version+1 WHERE site_id=? AND id=? AND version=?
      AND EXISTS(SELECT 1 FROM contact_status_event WHERE id=?) RETURNING id,status,version`)
      .bind(value.status,site,id,value.version,event),
  ]);
  const updated = result[1].results[0];
  if (!updated) {
    await getInquiry(env,session,site,id);
    fail(409,"inquiry_changed");
  }
  return updated;
}

export async function cleanupInquiries(env: SoraneAdminEnv) {
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM contact_inquiry WHERE expires_at<=?").bind(timestamp),
    env.DB.prepare("DELETE FROM contact_attempt WHERE hour<?").bind(Math.floor(timestamp/3600)-24),
    env.DB.prepare("DELETE FROM contact_window WHERE hour<?").bind(Math.floor(timestamp/3600)-24),
  ]);
}
