const SITE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_ATTEMPTS = 8, LEASE_SECONDS = 180;
// Never persist exception messages: providers can include addresses or bodies.
const ERROR_CODES = new Set(['E_SENDER_NOT_VERIFIED','E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE','E_DELIVERY_FAILED','E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED',
  'E_INTERNAL_SERVER_ERROR','E_VALIDATION_ERROR']);
const TERMINAL = new Set(['E_RECIPIENT_SUPPRESSED','E_VALIDATION_ERROR']);
const ACTIVE = `SELECT 1 FROM contact_inquiry i JOIN contact_notification_policy p ON p.site_id=i.site_id
  JOIN site_member m ON m.site_id=p.site_id AND m.sub=p.owner_sub AND m.role='owner'
  WHERE i.id=contact_notification.inquiry_id AND i.site_id=? AND i.expires_at>?
  AND p.policy_id=contact_notification.policy_id AND p.enabled=1`;
interface Delivery {
  inquiry_id: string; policy_id: string; attempts: number;
  from_email: string; to_email: string; admin_origin: string;
}
const escape = (value:string) => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

/** No inquiry fields enter an email. The link still requires owner sign-in. */
export function notificationMessage(row: Delivery, site: string): EmailMessageBuilder {
  const origin = new URL(row.admin_origin);
  if (!SITE.test(site) || !UUID.test(row.inquiry_id) || !UUID.test(row.policy_id) ||
    !EMAIL.test(row.from_email) || !EMAIL.test(row.to_email) ||
    row.from_email.length>254 || row.to_email.length>254 ||
    origin.protocol!=='https:' || origin.origin!==row.admin_origin) throw new Error('invalid_notification_policy');
  const link = `${origin.origin}/sites/${site}/inquiries/${row.inquiry_id}`;
  return {from:{email:row.from_email,name:'Sorane'},to:row.to_email,
    subject:'[Sorane] 新しい問い合わせが届きました',
    text:`新しい問い合わせが届きました。\n\n受信箱で確認してください（サインインが必要です）。\n${link}\n\n受付番号：${row.inquiry_id}\n\nこのメールは通知専用です。返信は受信箱の内容を確認してから行ってください。`,
    html:`<p>新しい問い合わせが届きました。</p><p><a href="${escape(link)}">受信箱で確認する</a>（サインインが必要です）</p><p>受付番号：${row.inquiry_id}</p><p>このメールは通知専用です。返信は受信箱の内容を確認してから行ってください。</p>`};
}

/** D1 leases coordinate immediate delivery and Cron. Retries are bounded.
 * A send accepted before a crash can be repeated; the provider has no atomic
 * transaction with D1. Normal request retries never enqueue a second message.
 */
export async function drainContactNotifications(env: Pick<SoranePagesContactEnv,'DB'|'NOTIFY'>, site:string, limit=10, inquiry?:string) {
  const summary = {sent:0,retried:0,failed:0,cancelled:0};
  if (!SITE.test(site) || !env.NOTIFY || (inquiry!==undefined && !UUID.test(inquiry))) return summary;
  const db = env.DB.withSession('first-primary'), timestamp = () => Math.floor(Date.now()/1000);
  const now = timestamp();
  const cancelled = await db.prepare(`UPDATE contact_notification SET state='cancelled',lease_token=NULL,lease_until=0
    WHERE state IN ('pending','sending') AND lease_until<=?
    AND inquiry_id IN (SELECT id FROM contact_inquiry WHERE site_id=?) AND NOT EXISTS(${ACTIVE})`)
    .bind(now,site,site,now).run();
  summary.cancelled = cancelled.meta.changes;
  const exhausted = await db.prepare(`UPDATE contact_notification SET state='failed',lease_token=NULL,lease_until=0,error_code='attempts_exhausted'
    WHERE state='sending' AND lease_until<=? AND attempts>=?
    AND inquiry_id IN (SELECT id FROM contact_inquiry WHERE site_id=?)`).bind(now,MAX_ATTEMPTS,site).run();
  summary.failed+=exhausted.meta.changes;
  for (let index=0; index<Math.min(25,Math.max(0,limit)); index++) {
    const time = timestamp(), token = crypto.randomUUID();
    const claimed = await db.prepare(`UPDATE contact_notification SET state='sending',attempts=attempts+1,lease_token=?,lease_until=?
      WHERE inquiry_id=(SELECT inquiry_id FROM contact_notification WHERE
        ((state='pending' AND next_at<=?) OR (state='sending' AND lease_until<=?))
        AND attempts<? AND EXISTS(${ACTIVE}) AND (? IS NULL OR inquiry_id=?) ORDER BY next_at,inquiry_id LIMIT 1)
      RETURNING inquiry_id,policy_id,attempts`)
      .bind(token,time+LEASE_SECONDS,time,time,MAX_ATTEMPTS,site,time,inquiry??null,inquiry??null).first<Pick<Delivery,'inquiry_id'|'policy_id'|'attempts'>>();
    if (!claimed) break;
    // Recheck owner, destination generation and retention immediately before
    // sending. A policy/owner change during the claim must not disclose a link.
    const row = await db.prepare(`SELECT n.inquiry_id,n.policy_id,n.attempts,p.from_email,p.to_email,p.admin_origin
      FROM contact_notification n JOIN contact_notification_policy p ON n.policy_id=p.policy_id
      JOIN contact_inquiry i ON i.id=n.inquiry_id AND i.site_id=p.site_id
      JOIN site_member m ON m.site_id=p.site_id AND m.sub=p.owner_sub AND m.role='owner'
      WHERE n.inquiry_id=? AND n.lease_token=? AND n.state='sending' AND p.site_id=? AND p.enabled=1 AND i.expires_at>?`)
      .bind(claimed.inquiry_id,token,site,timestamp()).first<Delivery>();
    if (!row) {
      await db.prepare(`UPDATE contact_notification SET state='cancelled',lease_token=NULL,lease_until=0
        WHERE inquiry_id=? AND lease_token=?`).bind(claimed.inquiry_id,token).run();
      summary.cancelled++; continue;
    }
    let message: EmailMessageBuilder;
    try { message=notificationMessage(row,site); }
    catch {
      await db.prepare(`UPDATE contact_notification SET state='failed',lease_token=NULL,lease_until=0,error_code='invalid_policy'
        WHERE inquiry_id=? AND lease_token=?`).bind(row.inquiry_id,token).run();
      summary.failed++; continue;
    }
    let result: EmailSendResult;
    try { result=await env.NOTIFY.send(message); }
    catch (error) {
      const value = error && typeof error==='object' && 'code' in error ? error.code : null;
      const code = typeof value==='string' && ERROR_CODES.has(value) ? value : 'send_failed';
      const failed = row.attempts>=MAX_ATTEMPTS || TERMINAL.has(code);
      await db.prepare(`UPDATE contact_notification SET state=?,next_at=?,error_code=?,lease_token=NULL,lease_until=0
        WHERE inquiry_id=? AND lease_token=? AND state='sending'`)
        .bind(failed?'failed':'pending',timestamp()+Math.min(3600,60*2**(row.attempts-1)),code,row.inquiry_id,token).run();
      if (failed) summary.failed++; else summary.retried++;
      continue;
    }
    // Keep DB failure outside the send catch. Retrying here would release a
    // successfully sent job immediately; retain its lease for crash recovery.
    const sent = await db.prepare(`UPDATE contact_notification SET state='sent',sent_at=?,message_id=?,error_code=NULL,lease_token=NULL,lease_until=0
      WHERE inquiry_id=? AND lease_token=? AND state='sending'`)
      .bind(timestamp(),typeof result.messageId==='string'?result.messageId.slice(0,256):null,row.inquiry_id,token).run();
    summary.sent+=sent.meta.changes;
  }
  return summary;
}

export async function deliverContactNotifications(env: Pick<SoranePagesContactEnv,'DB'|'NOTIFY'>, site:string, limit=10, inquiry?:string) {
  try {return await drainContactNotifications(env,site,limit,inquiry);}
  catch {console.error(JSON.stringify({event:'contact_notification_processing_failed'}));}
}
