import {
  BROWSER, SESSION, HttpError, fail, random, hash, escape, cookie, cookieHeader,
  baseHeaders, formCsrf, readForm, current, requireSession, login, callback,
  backchannel, logout, cleanup, type Session,
} from "../vendor/mikaki/oidc.ts";
import { errors } from "jose";
import { ROLES, can, checkInstance, getSite, listSites, siteDetails, mutate, type Action, type Role } from "./store.ts";
import { enqueueBuilds, preview } from "./builds.ts";
import { contentDraft, draftDigest, MAX_DRAFT_REQUEST } from '../../ssg-worker/src/draft-input.ts';
import { CSS, SCRIPT, shell, roleLabels } from './ui.ts';
import { workspace, articleList, editorPage, editorDraft } from './editor.ts';
import { reviewPage, settingsPage } from './site-views.ts';
import { listInquiries, getInquiry, updateInquiry, cleanupInquiries, INQUIRY_STATUSES } from "./inquiries.ts";

const SITE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COMMIT = /^[0-9a-f]{40}$/;

function json(env: SoraneAdminEnv, value: unknown, status = 200): Response {
  const headers = baseHeaders(env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}
function page(env: SoraneAdminEnv, title: string, body: string, browser?: string, status = 200): Response {
  const headers = baseHeaders(env);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Security-Policy", `default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self' ${env.ISSUER}; frame-ancestors 'none'; base-uri 'none'`);
  if (browser) headers.append("Set-Cookie", cookieHeader(BROWSER, browser, 86400));
  const content = body.includes('class="app-shell"') || body.includes('class="center-page"') ? body : `<div class="center-page"><a class="brand" href="/">sorane<span class="brand-dot">.</span></a><main><h1>${escape(title)}</h1>${body}</main></div>`;
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · sorane</title><link rel="stylesheet" href="/admin.css"><script src="/admin.js" defer></script></head><body>${content}</body></html>`, { status, headers });
}
function config(env: SoraneAdminEnv): void {
  if (!["full","inquiries"].includes(String(env.ADMIN_MODE ?? "full"))) fail(503,"invalid_configuration");
  for (const value of [env.ISSUER, env.RP_ORIGIN]) {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
      fail(503, "invalid_configuration");
  }
  if (!env.CLIENT_ID || env.CLIENT_ID === "register-this-rp-with-mikaki") fail(503, "admin_not_configured");
  const publicOrigin = new URL(env.PUBLIC_ORIGIN);
  if (publicOrigin.origin !== env.PUBLIC_ORIGIN || publicOrigin.protocol !== "https:" ||
    publicOrigin.origin === String(env.RP_ORIGIN) || !/^[0-9a-f]{64}$/.test(env.EXPECTED_ENGINE))
    fail(503,"invalid_publication_configuration");
}
async function csrf(request: Request, env: SoraneAdminEnv): Promise<void> {
  if (request.headers.get("Origin") !== env.RP_ORIGIN) fail(403, "invalid_origin");
  const browser = cookie(request, BROWSER);
  const supplied = request.headers.get("X-CSRF-Token") ?? "";
  if (!browser || !supplied) fail(403, "invalid_csrf");
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(await hash(browser))),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  if (!crypto.subtle.timingSafeEqual(left, right)) fail(403, "invalid_csrf");
}
async function body(request: Request, env: SoraneAdminEnv, limit=8192): Promise<Record<string, unknown>> {
  if (request.headers.get("Content-Type")?.split(";")[0] === "application/x-www-form-urlencoded") {
    const form = await readForm(request, env);
    form.delete("csrf");
    const value: Record<string, unknown> = Object.fromEntries(form);
    if (typeof value.revision === "string" && /^[1-9][0-9]*$/.test(value.revision)) value.revision = Number(value.revision);
    return value;
  }
  await csrf(request, env);
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") fail(415, "unsupported_media_type");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "missing_body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); fail(413, "request_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { fail(400, "invalid_json"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "invalid_json");
  return value as Record<string, unknown>;
}
function input(value: Record<string, unknown>, action: Action, proposalId?: string) {
  const keys = ["operationId", "revision", ...(action === "member.set" ? ["sub", "role"] :
    action === "member.remove" ? ["sub"] : action === "proposal.submit" ? ["commit", "message"] : ["commit", "candidate"])];
  if (Object.keys(value).some((key) => !keys.includes(key))) fail(400, "unknown_field");
  if (typeof value.operationId !== "string" || !UUID.test(value.operationId) ||
    typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision >= Number.MAX_SAFE_INTEGER)
    fail(400, "invalid_operation");
  const result: Parameters<typeof mutate>[4] = { operationId: value.operationId, revision: value.revision };
  if (action.startsWith("member.")) {
    if (typeof value.sub !== "string" || !value.sub || value.sub.length > 255 || /[\x00-\x1f\x7f]/.test(value.sub)) fail(400, "invalid_subject");
    result.sub = value.sub;
    if (action === "member.set") {
      if (!ROLES.includes(value.role as Role)) fail(400, "invalid_role");
      result.role = value.role as Role;
    }
  } else {
    if (typeof value.commit !== "string" || !COMMIT.test(value.commit)) fail(400, "invalid_commit");
    result.commit = value.commit;
    if (action === "proposal.submit") {
      if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 1000) fail(400, "invalid_message");
      result.message = value.message.trim();
    } else {
      if (typeof value.candidate !== "string" || !/^[0-9a-f]{64}$/.test(value.candidate)) fail(400,"invalid_candidate");
      result.proposalId = proposalId; result.candidate=value.candidate;
    }
  }
  return result;
}
function fields(csrfToken: string, revision: number) {
  return `${formCsrf(csrfToken)}<input type="hidden" name="operationId" value="${random().slice(0,36)}"><input type="hidden" name="revision" value="${revision}">`;
}
function draftInput(value:Record<string,unknown>, form=false) {
  const keys=['operationId','revision','commit','message','repositoryId','changes'];
  if (Object.keys(value).some(key=>!keys.includes(key))) fail(400,'unknown_field');
  const result=input({operationId:value.operationId,revision:value.revision,commit:value.commit,message:value.message},'proposal.submit');
  try {result.draft=contentDraft({schema:1,repository:value.repositoryId,changes:form && typeof value.changes==='string'?JSON.parse(value.changes):value.changes});}
  catch {fail(400,'invalid_content_draft');}
  return result;
}
async function home(request: Request, env: SoraneAdminEnv): Promise<Response> {
  const browser = cookie(request, BROWSER) || random();
  const token = await hash(browser), session = await current(request, env);
  const inboxMode = String(env.ADMIN_MODE) === "inquiries";
  const brand='<a class="brand" href="/"><span class="brand-mark">s</span>sorane<span class="brand-dot">.</span></a>';
  if (!session) return page(env, "サイト管理にサインイン", `<div class="center-page">${brand}<main><section><p class="eyebrow">WELCOME</p><h1>${inboxMode?"問い合わせを、ここで確認。":"書くことから、はじめよう。"}</h1><p>${inboxMode?"受付内容を確認し、対応状況を管理できます。":"原稿を整えて、プレビューを確認。<br>あなたのサイトを、ここから育てられます。"}</p><form method="post" action="/login">${formCsrf(token)}<button>Mikakiでサインイン</button></form><p><small>Passkeyで安全にサインインします。</small></p></section></main></div>`, browser);
  const sites = await listSites(env, session.sub), inquiriesOnly = String(env.ADMIN_MODE) === "inquiries";
  return page(env,"サイト一覧",`<div class="center-page">${brand}<main><p class="eyebrow">YOUR SITES</p><h1>サイトを選ぶ</h1><p>${inquiriesOnly?"受信箱を開いて、問い合わせを確認できます。":"編集するサイトを開いて、続きを書きましょう。"}</p><div class="site-grid">${sites.map(site=>`<a class="site-card" href="/sites/${site.id}"><h2>${escape(site.title)}</h2><span>${inquiriesOnly?"問い合わせを確認する":"記事を管理する"} →</span><small>${roleLabels[site.role]}</small></a>`).join('')}</div>${sites.length?'':`<section><h2>サイトへのアクセスが必要です</h2><p>サイトの管理者に、次の識別子を伝えてください。</p><code>${escape(session.sub)}</code></section>`}<details class="technical"><summary>アカウント</summary><p>Mikakiの識別子：<code>${escape(session.sub)}</code></p><form method="post" action="/logout">${formCsrf(token)}<button class="secondary">ログアウト</button></form></details></main></div>`,browser);
}
async function sitePage(request: Request, env: SoraneAdminEnv, session: Session, siteId: string): Promise<Response> {
  const site = await getSite(env, siteId, session.sub);
  if (String(env.ADMIN_MODE) === "inquiries") {
    const headers = baseHeaders(env); headers.set("Location",`/sites/${site.id}/inquiries`);
    return new Response(null,{status:303,headers});
  }
  const { members, proposals, publication } = await siteDetails(env, site);
  const browser = cookie(request, BROWSER) || random(), token = await hash(browser);
  const hidden = () => fields(token, site.revision), url = new URL(request.url);
  const editor=url.pathname.endsWith('/editor');
  const requested=url.searchParams.get('view')??'articles';
  const view=editor?'articles':requested;
  if(!['articles','review','settings'].includes(view)) fail(404,'not_found');
  if(view==='settings' && site.role!=='owner') fail(403,'permission_denied');
  let content:string;
  if(view==='review') content=reviewPage(env,site,proposals,publication,token,hidden);
  else if(view==='settings') content=settingsPage(site,members,token,hidden);
  else {
    const selected=url.searchParams.get('proposal')??proposals[0]?.id;
    if(selected&&!proposals.some(proposal=>proposal.id===selected)) fail(404,'proposal_not_found');
    let source=null;
    if(selected) {
      try { source=await workspace(env,site.id,selected); }
      catch(error) {
        if(editor) throw error;
        content=`<div class="heading-row"><div><h1>記事</h1><p>原稿を読み込んで編集できます。</p></div></div><section class="error-panel"><h2>原稿を読み込めませんでした</h2><p>しばらくしてから、もう一度お試しください。</p><a class="button secondary" href="/sites/${site.id}">もう一度読み込む</a></section>`;
        return page(env,site.title,shell(site,view,content,token,env.PUBLIC_ORIGIN,proposals.filter(p=>p.state==='submitted').length),browser);
      }
    }
    const editable=can(site.role,'proposal.submit');
    if(editor&&!source) fail(404,'proposal_not_found');
    content=editor?editorPage(site,source!,url.searchParams.get('path'),token,crypto.randomUUID(),editable):articleList(site,source,editable);
  }
  return page(env,site.title,shell(site,view,content,token,env.PUBLIC_ORIGIN,proposals.filter(p=>p.state==='submitted').length),browser);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      config(env);
      const url = new URL(request.url);
      if (url.origin !== env.RP_ORIGIN) fail(400, "invalid_host");
      await checkInstance(env);
      if (request.method === "GET" && url.pathname === "/health") return json(env, { ok: true });
      if (request.method === "GET" && url.pathname === "/admin.css") {
        const headers = baseHeaders(env); headers.set("Content-Type", "text/css; charset=utf-8");
        return new Response(CSS, { headers });
      }
      if (request.method === "GET" && url.pathname === "/admin.js") {
        const headers = baseHeaders(env); headers.set("Content-Type", "text/javascript; charset=utf-8");
        return new Response(SCRIPT, { headers });
      }
      if (request.method === "GET" && url.pathname === "/") return await home(request, env);
      if (request.method === "POST" && url.pathname === "/login") return await login(request, env);
      if (request.method === "GET" && url.pathname === "/callback") return await callback(request, env, url, "/");
      if (request.method === "POST" && url.pathname === "/backchannel") return await backchannel(request, env);
      if (request.method === "POST" && url.pathname === "/logout") return await logout(request, env);
      if (request.method === "GET" && url.pathname === "/api/session") {
        const session = await requireSession(request, env);
        return json(env, { sub: session.sub, issuer: env.ISSUER, csrf: await hash(cookie(request, BROWSER)), lease_until: session.lease_until });
      }
      if (request.method === "POST" && url.pathname === "/session/check") {
        await body(request, env);
        const session = await requireSession(request, env, true);
        return json(env, { active: true, lease_until: session.lease_until });
      }
      const session = await requireSession(request, env);
      if (request.method === "GET" && url.pathname === "/api/sites") return json(env, { sites: await listSites(env, session.sub) });
      const match = /^\/(api\/)?sites\/([^/]+)(.*)$/.exec(url.pathname);
      if (!match || !SITE_ID.test(match[2])) fail(404, "not_found");
      const [, api, siteId, tail] = match;
      if (String(env.ADMIN_MODE) === "inquiries" && tail && !/^\/inquiries(?:\/[0-9a-f-]+)?$/.test(tail)) fail(404,"not_found");
      if (!api && (!tail || tail === "/editor") && request.method === "GET") return await sitePage(request, env, session, siteId);
      const site = await getSite(env, siteId, session.sub);
      if (api && !tail && request.method === "GET") return json(env, await siteDetails(env, site));
      if (api && tail === "/audit" && request.method === "GET") {
        if (site.role !== "owner") fail(403, "permission_denied");
        const audit = await env.DB.withSession("first-primary").prepare("SELECT * FROM admin_operation WHERE site_id=? ORDER BY created_at DESC,id LIMIT 100").bind(siteId).all();
        return json(env, { operations: audit.results });
      }
      if(api && request.method==='POST' && (tail==='/editor' || tail==='/editor/rebuild')) {
        const value=await body(request,env,MAX_DRAFT_REQUEST), rebuild=tail.endsWith('/rebuild');
        const allowed=['operationId','revision','proposalId',...(rebuild?[]:['path','title','body','timestamp'])];
        if(Object.keys(value).some(key=>!allowed.includes(key))) fail(400,'unknown_field');
        const operation=input({operationId:value.operationId,revision:value.revision,commit:'0'.repeat(40),message:'原稿を更新'},'proposal.submit');
        if(typeof value.proposalId!=='string' || !UUID.test(value.proposalId)) fail(400,'invalid_operation');
        if(!can(site.role,'proposal.submit')) fail(403,'permission_denied');
        const fresh=await requireSession(request,env,true);
        const source=await workspace(env,site.id,value.proposalId);
        const saved=rebuild?{draft:source.changes.length?contentDraft({schema:1,repository:source.repositoryId,changes:source.changes}):undefined,
          message:await env.DB.withSession('first-primary').prepare('SELECT message FROM proposal WHERE id=? AND site_id=?').bind(value.proposalId,site.id).first<string>('message')??'プレビューを作り直す'}:
          await editorDraft(source,value);
        const result=await mutate(env,fresh,site,'proposal.submit',{...operation,commit:source.commit,...saved});
        ctx.waitUntil(enqueueBuilds(env).catch(()=>console.error(JSON.stringify({event:'build_outbox_send_failed'}))));
        return json(env,{proposal_id:operation.operationId,site_revision:result.operation.site_revision+1,replay:result.replay},result.replay?200:201);
      }
      const inquiryRoute = /^\/inquiries(?:\/([0-9a-f-]+))?$/.exec(tail);
      if (inquiryRoute) {
        const fresh = await requireSession(request,env,true);
        const id = inquiryRoute[1];
        if (request.method === "GET") {
          const browser = cookie(request,BROWSER) || random(), token = await hash(browser);
          const currentSite = await getSite(env,siteId,fresh.sub);
          const inquiryPage = (title:string,body:string) => page(env,title,
            shell(currentSite,"inquiries",`<div class="heading-row"><h1>${escape(title)}</h1></div>${body}`,token,env.PUBLIC_ORIGIN,0,String(env.ADMIN_MODE)==="inquiries"),browser);
          if (id) {
            const inquiry = await getInquiry(env,fresh,siteId,id);
            if (api) return json(env,{inquiry});
            return inquiryPage("問い合わせの詳細",`<p><a href="/sites/${siteId}/inquiries">受信箱へ戻る</a></p><section><h2>${escape(inquiry.subject)}</h2><p>受付番号：<code>${inquiry.id}</code></p><p>受付日時：${new Date(inquiry.created_at*1000).toISOString()}</p><p>お名前：${escape(inquiry.name || "未入力")}</p><p>返信先：${escape(inquiry.email)}</p><pre>${escape(inquiry.body)}</pre><p>保存期限：${new Date(inquiry.expires_at*1000).toISOString()}</p><form method="post" action="/api/sites/${siteId}/inquiries/${id}">${formCsrf(token)}<input type="hidden" name="version" value="${inquiry.version}"><label>対応状況<select name="status" aria-label="対応状況">${Object.entries(INQUIRY_STATUSES).map(([value,label])=>`<option value="${value}"${value===inquiry.status?" selected":""}>${label}</option>`).join("")}</select></label><button>対応状況を保存</button></form></section>`);
          }
          const inbox = await listInquiries(env,fresh,siteId,url);
          if (api) return json(env,inbox);
          const filter = url.searchParams.get("status");
          return inquiryPage("問い合わせ受信箱",`<p><a href="/sites/${siteId}">サイト管理へ戻る</a></p><p>問い合わせは受付から30日後に削除します。メール通知は行いません。</p><form method="get"><label>対応状況<select name="status" aria-label="対応状況"><option value="">すべて</option>${Object.entries(INQUIRY_STATUSES).map(([value,label])=>`<option value="${value}"${filter===value?" selected":""}>${label}</option>`).join("")}</select></label><button>絞り込む</button></form>${inbox.inquiries.length ? `<table><thead><tr><th>件名</th><th>返信先</th><th>対応状況</th></tr></thead><tbody>${inbox.inquiries.map(inquiry=>`<tr><td><a href="/sites/${siteId}/inquiries/${inquiry.id}">${escape(inquiry.subject)}</a></td><td>${escape(inquiry.email)}</td><td>${INQUIRY_STATUSES[inquiry.status]}</td></tr>`).join("")}</tbody></table>` : "<p>問い合わせはありません。</p>"}${inbox.next ? `<p><a href="?before=${inbox.next}${filter?`&amp;status=${filter}`:""}">次の25件</a></p>` : ""}`);
        }
        if (api && id && request.method === "POST") {
          const value = await body(request,env);
          if (typeof value.version === "string" && /^\d+$/.test(value.version)) value.version=Number(value.version);
          const result = await updateInquiry(env,fresh,siteId,id,value);
          if (request.headers.get("Content-Type")?.split(";")[0] === "application/x-www-form-urlencoded") {
            const headers = baseHeaders(env); headers.set("Location",`/sites/${siteId}/inquiries/${id}`);
            return new Response(null,{status:303,headers});
          }
          return json(env,result);
        }
        fail(404,"not_found");
      }
      const draftRoute=/^\/proposals\/([0-9a-f-]+)\/draft$/.exec(tail);
      if (draftRoute && UUID.test(draftRoute[1]) && request.method==='GET') {
        const row=await env.DB.withSession('first-primary').prepare(`SELECT d.payload,d.digest,p.commit_id,p.expected_repository_id,p.draft_digest FROM proposal_draft d
          JOIN proposal p ON p.id=d.proposal_id WHERE p.id=? AND p.site_id=?`).bind(draftRoute[1],site.id)
          .first<{payload:string;digest:string;commit_id:string;expected_repository_id:string;draft_digest:string}>();
        if (!row) fail(404,'draft_not_found');
        const draft=contentDraft(JSON.parse(row.payload));
        if (await draftDigest(draft)!==row.digest || row.digest!==row.draft_digest || draft.repository!==row.expected_repository_id) fail(503,'draft_integrity_error');
        if (api) return json(env,{commit:row.commit_id,digest:row.digest,...draft});
        return page(env,'原稿変更案',`<p>基準コミット：<code>${escape(row.commit_id)}</code></p><p>この変更案は基準コミットに重ねてビルドされます。プレビューを確認してから公開してください。</p>${draft.changes.map(change=>`<section><h2>${escape(change.path)}</h2><p>${change.before===null?'新規作成':change.text===null?'削除':'置換'}</p>${change.text===null?'':`<pre>${escape(change.text)}</pre>`}</section>`).join('')}<p><a href="/sites/${site.id}">管理画面に戻る</a></p>`);
      }
      if (!api || request.method !== "POST") fail(404, "not_found");
      const previewRoute = /^\/proposals\/([0-9a-f-]+)\/preview$/.exec(tail);
      if (previewRoute && UUID.test(previewRoute[1])) {
        if (Object.keys(await body(request,env)).length) fail(400,"unknown_field");
        const ticket=await preview(env,await requireSession(request,env,true),site,previewRoute[1]);
        if (request.headers.get("Content-Type")?.split(";")[0] === "application/x-www-form-urlencoded") {
          // Cross-origin form redirects are blocked by the management page's
          // form-action policy. A normal link keeps that policy restricted.
          return page(env,"プレビューを開く",`<p><a href="${escape(ticket.url)}" rel="noreferrer">プレビューを表示</a></p><p>このリンクは60秒以内に失効します。失効した場合は管理画面から開き直してください。</p><p><a href="/sites/${siteId}">管理画面に戻る</a></p>`);
        }
        return json(env,ticket,201);
      }
      const approve = /^\/proposals\/([0-9a-f-]+)\/approve$/.exec(tail);
      const action: Action = tail === "/members" ? "member.set" : tail === "/members/remove" ? "member.remove" : (tail === "/proposals" || tail === "/drafts") ? "proposal.submit" : approve && UUID.test(approve[1]) ? "proposal.approve" : fail(404, "not_found");
      const value = tail==="/drafts" ? draftInput(await body(request,env,MAX_DRAFT_REQUEST),request.headers.get('Content-Type')?.split(';')[0]==='application/x-www-form-urlencoded') : input(await body(request, env), action, approve?.[1]);
      // A fresh managed Mikaki status check is required for every new or retried
      // privileged operation. Cookie/JWT validation alone never grants site rights.
      const fresh = await requireSession(request, env, true);
      const result = await mutate(env, fresh, site, action, value);
      if (action === "proposal.submit") ctx.waitUntil(enqueueBuilds(env).catch(() => {
        console.error(JSON.stringify({event:"build_outbox_send_failed"}));
      }));
      const activeApproval = action === "proposal.approve" ? await env.DB.withSession("first-primary")
        .prepare("SELECT approval_id FROM site_publication WHERE site_id=?").bind(siteId).first<string>("approval_id") : null;
      if (request.headers.get("Content-Type")?.split(";")[0] === "application/x-www-form-urlencoded") {
        const headers = baseHeaders(env); headers.set("Location", `/sites/${siteId}?view=${action.startsWith("member.")?"settings":"review"}`);
        return new Response(null, { status: 303, headers });
      }
      return json(env, { operation_id: result.operation.id, replay: result.replay,
        site_revision: result.operation.site_revision + 1,
        ...(action === "proposal.submit" ? { proposal_id: value.operationId, state: "submitted", ...(value.draft?{draft_digest:await draftDigest(value.draft)}:{}) } :
          action === "proposal.approve" ? { proposal_id: value.proposalId, state: "approved", deployed: activeApproval===result.operation.id, publication_url: `${env.PUBLIC_ORIGIN}/${siteId}/` } : {}),
      }, result.replay ? 200 : 201);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof errors.JOSEError ? 401 : 503;
      const reason = error instanceof HttpError ? error.message : status === 401 ? "invalid_identity_token" : "service_unavailable";
      if (status >= 500) console.error(JSON.stringify({ event: "admin_request_failed", request_id: crypto.randomUUID(), status }));
      if(request.method==='GET' && request.headers.get('Accept')?.includes('text/html'))
        return page(env,status===401?'サインインしてください':status===404?'ページが見つかりません':'ページを開けませんでした',`<section><p>${status===401?'サインインしてから、もう一度開いてください。':status===404?'ページが移動したか、アクセスできない可能性があります。':'時間をおいて、もう一度お試しください。'}</p><a class="button" href="/">サイト一覧へ戻る</a></section>`,undefined,status);
      if (status === 401 && request.headers.get("Accept")?.includes("text/html") &&
        request.headers.get("Content-Type")?.split(";")[0] === "application/x-www-form-urlencoded")
        return page(env,"再度サインインしてください",`<p>サインインを確認できませんでした。もう一度サインインしてから操作をやり直してください。</p><p><a href="/">管理画面に戻ってサインイン</a></p>`,undefined,401);
      return json(env, { error: reason }, status);
    }
  },
  async scheduled(_event, env): Promise<void> {
    config(env); await checkInstance(env); await cleanup(env);
    await cleanupInquiries(env);
    await env.DB.prepare("DELETE FROM preview_ticket WHERE expires_at<=?").bind(Math.floor(Date.now()/1000)).run();
    if (String(env.ADMIN_MODE) !== "inquiries") await enqueueBuilds(env);
  },
} satisfies ExportedHandler<SoraneAdminEnv>;
