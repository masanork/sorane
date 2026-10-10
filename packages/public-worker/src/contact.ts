import { createHash } from "node:crypto";
import { CONTACT_LIMITS, CONTACT_RETENTION_SECONDS } from "../../core/src/contact.ts";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const MAX_REQUEST = 100000;
class InputError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function reject(status: number, reason: string): never { throw new InputError(status, reason); }

async function input(request: Request) {
  const type = request.headers.get("Content-Type")?.split(";")[0].trim();
  if (type !== "application/json" && type !== "application/x-www-form-urlencoded") reject(415, "unsupported_content_type");
  if (Number(request.headers.get("Content-Length")) > MAX_REQUEST) reject(413, "request_too_large");
  if (!request.body) reject(400, "invalid_input");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST) { await reader.cancel(); reject(413, "request_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: Record<string,unknown>;
  try {
    const text = new TextDecoder("utf-8", {fatal:true,ignoreBOM:false}).decode(bytes);
    if (type === "application/json") value = JSON.parse(text);
    else {
      const fields = new URLSearchParams(text);
      if ([...fields.keys()].some((key) => fields.getAll(key).length !== 1)) reject(400,"duplicate_field");
      value = Object.fromEntries(fields);
    }
  } catch (error) { if (error instanceof InputError) throw error; reject(400,"invalid_input"); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((key) => ![...Object.keys(CONTACT_LIMITS),"consent","request_id","website"].includes(key))) reject(400,"invalid_input");
  const result = {name:"",email:"",subject:"",body:""};
  for (const key of Object.keys(CONTACT_LIMITS) as (keyof typeof CONTACT_LIMITS)[]) {
    const raw = value[key] ?? (key === "name" ? "" : null);
    if (typeof raw !== "string" || raw.length > CONTACT_LIMITS[key] || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw)) reject(400,"invalid_input");
    result[key] = raw.trim();
    if (key !== "name" && !result[key]) reject(400,"invalid_input");
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result.email) || /[\r\n]/.test(result.name + result.subject)) reject(400,"invalid_input");
  if (value.consent !== true && value.consent !== "yes") reject(400,"consent_required");
  if (value.website !== undefined && typeof value.website !== "string") reject(400,"invalid_input");
  let key = value.request_id;
  // A plain HTML form works without JavaScript. Enhanced submissions always
  // carry a UUID, which lets a lost response be retried without another inquiry.
  if ((key === undefined || key === "") && type === "application/x-www-form-urlencoded") key = crypto.randomUUID();
  if (typeof key !== "string" || !UUID.test(key)) reject(400,"invalid_request_id");
  return {fields:result,key,spam:!!value.website};
}

function response(request: Request, status: number, receipt?: string, reason?: string): Response {
  const headers = new Headers({"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
    "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "X-Robots-Tag":"noindex, nofollow"});
  if (status === 429) headers.set("Retry-After", String(3600 - Math.floor(Date.now()/1000)%3600));
  if (request.headers.get("Accept")?.includes("text/html") && !request.headers.get("Accept")?.includes("application/json")) {
    headers.set("Content-Type","text/html; charset=utf-8");
    const sitePath = new URL(request.url).pathname.replace(/_contact$/, "");
    const message = receipt ? `問い合わせを受け付けました。受付番号：${receipt}` :
      status === 429 ? "送信回数の上限に達しました。時間をおいて再度お試しください。" : "受付できませんでした。前の画面に戻り、入力内容を確認してください。";
    return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>問い合わせ受付</title><h1>問い合わせ受付</h1><p>${message}</p><p><a href="${sitePath}">サイトへ戻る</a></p></html>`,{status,headers});
  }
  headers.set("Content-Type","application/json; charset=utf-8");
  return new Response(JSON.stringify(receipt ? {receipt} : {error:reason}),{status,headers});
}

/** Called only after the published, content-addressed manifest opts in. */
export async function receiveContact(request: Request, env: {DB:D1Database;PUBLIC_ORIGIN:string}, site: string, candidate: string,
  source: "worker" | "pages" = "worker"): Promise<Response> {
  try {
    if (request.headers.get("Origin") !== env.PUBLIC_ORIGIN ||
      request.headers.get("Sec-Fetch-Site") === "cross-site") reject(403,"invalid_origin");
    const {fields,key,spam} = await input(request);
    if (spam) return response(request,202,crypto.randomUUID());
    const now = Math.floor(Date.now()/1000), hour = Math.floor(now/3600);
    const db = env.DB.withSession("first-primary");
    const publication = source === "pages" ?
      "SELECT 1 FROM pages_contact_publication WHERE site_id=? AND policy_digest=? AND enabled=1 AND origin=? AND EXISTS(SELECT 1 FROM site_member WHERE site_id=pages_contact_publication.site_id AND role='owner')" :
      "SELECT 1 FROM site_publication WHERE site_id=? AND candidate_digest=?";
    const publicationValues = source === "pages" ? [site,candidate,env.PUBLIC_ORIGIN] : [site,candidate];
    const payloadHash = digest(JSON.stringify(fields));
    await db.prepare("INSERT OR IGNORE INTO contact_window(site_id,hour,salt) VALUES(?,?,?)").bind(site,hour,crypto.randomUUID()).run();
    const salt = await db.prepare("SELECT salt FROM contact_window WHERE site_id=? AND hour=?").bind(site,hour).first<string>("salt");
    // Only the salted, hourly hash is stored. Never retain or log raw client IPs.
    const client = digest(`${salt}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`);
    const id = crypto.randomUUID();
    const batch = await db.batch([
      db.prepare(`INSERT INTO contact_attempt(id,site_id,hour,client_hash) SELECT ?,?,?,?
        WHERE EXISTS(${publication})
        AND NOT EXISTS(SELECT 1 FROM contact_inquiry WHERE site_id=? AND request_id=?)
        AND (SELECT COUNT(*) FROM contact_attempt WHERE site_id=? AND hour=?)<100
        AND (SELECT COUNT(*) FROM contact_attempt WHERE site_id=? AND hour=? AND client_hash=?)<5`)
        .bind(id,site,hour,client,...publicationValues,site,key,site,hour,site,hour,client),
      db.prepare(`INSERT INTO contact_inquiry(id,site_id,request_id,payload_hash,name,email,subject,body,created_at,expires_at)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM contact_attempt WHERE id=?)`)
        .bind(id,site,key,payloadHash,fields.name,fields.email,fields.subject,fields.body,now,now+CONTACT_RETENTION_SECONDS,id),
      db.prepare("SELECT id,payload_hash FROM contact_inquiry WHERE site_id=? AND request_id=? AND expires_at>?").bind(site,key,now),
    ]);
    const row = batch[2].results[0] as {id:string;payload_hash:string} | undefined;
    if (!row) {
      if (!await db.prepare(publication).bind(...publicationValues).first()) reject(404,"not_found");
      reject(429,"rate_limited");
    }
    if (row.payload_hash !== payloadHash) reject(409,"request_id_conflict");
    return response(request,row.id === id ? 201 : 200,row.id);
  } catch (error) {
    return response(request,error instanceof InputError ? error.status : 503,undefined,error instanceof InputError ? error.message : "service_unavailable");
  }
}
