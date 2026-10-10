import type { SoraneConfig } from "./config.ts";
import { createHash } from "node:crypto";

export const CONTACT_LIMITS = { name: 200, email: 254, subject: 200, body: 8000 } as const;
export const CONTACT_RETENTION_SECONDS = 30 * 86400;
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export function resolveContact(config: Pick<SoraneConfig, "site">) {
  if (config.site.contact?.form?.enabled !== true) return undefined;
  const page = config.site.contact.page ?? "contact.html";
  if (!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.html$/.test(page)) throw new Error("invalid_contact_page");
  let base: URL;
  try { base = new URL(config.site.base_url); } catch { throw new Error("invalid_contact_base_url"); }
  if (base.username || base.password || base.search || base.hash ||
    (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost","127.0.0.1"].includes(base.hostname))))
    throw new Error("invalid_contact_base_url");
  base.pathname = base.pathname.replace(/\/?$/, "/");
  const notice = config.site.contact.form.privacy_notice ?? "入力内容は問い合わせへの対応に使用し、受付から30日後に削除します。メール通知は行いません。";
  if (typeof notice !== "string" || !notice.trim() || notice.length > 2000) throw new Error("invalid_contact_privacy_notice");
  return { page, endpoint: new URL("_contact", base).pathname, notice };
}

// Keep the retry key in this document only. No personal information is persisted
// to localStorage, placed in URLs, or sent by WebMCP's draft preparation tool.
export const CONTACT_SCRIPT = `
for (const form of document.querySelectorAll('form[data-sorane-contact]')) {
  const key = form.elements.namedItem('request_id');
  key.value = crypto.randomUUID();
  const status = form.querySelector('[data-sorane-contact-status]');
  const button = form.querySelector('button[type="submit"]');
  if (location.pathname.startsWith('/preview/')) {
    button.disabled = true; status.textContent = 'プレビューでは問い合わせを送信できません。';
    form.addEventListener('submit', (event) => event.preventDefault());
    continue;
  }
  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true; button.disabled = true;
    status.textContent = '送信しています…';
    try {
      const response = await fetch(form.action, { method: 'POST', credentials: 'omit',
        headers: { 'Accept': 'application/json' }, body: new URLSearchParams(new FormData(form)) });
      const result = await response.json();
      if (!response.ok) {
        status.textContent = response.status === 429 ? '送信回数の上限に達しました。時間をおいて再度お試しください。' :
          response.status === 409 ? '送信内容が変わっています。新しい問い合わせとしてもう一度送信してください。' :
          response.status === 400 ? '入力内容と同意を確認してください。' : '受付できませんでした。入力内容は残っています。もう一度お試しください。';
        if (response.status === 409) key.value = crypto.randomUUID();
        return;
      }
      form.reset(); key.value = crypto.randomUUID();
      const draftStatus = form.querySelector('[data-webmcp-contact-status]');
      if (draftStatus) draftStatus.textContent = '';
      status.textContent = '問い合わせを受け付けました。受付番号：' + result.receipt;
    } catch {
      status.textContent = '通信を確認できませんでした。入力内容は残っています。もう一度送信すると同じ受付番号で確認できます。';
    } finally { pending = false; button.disabled = false; }
  });
}
`;
export const CONTACT_SCRIPT_FILE = `contact-${createHash("sha256").update(CONTACT_SCRIPT).digest("hex").slice(0,16)}.js`;
export const CONTACT_CSS = `
.sorane-contact input:not([type="checkbox"]):not([type="hidden"]),.sorane-contact textarea {
  box-sizing:border-box;display:block;width:100%;max-width:100%;padding:.65rem;
  border:1px solid var(--border,#d8d8db);border-radius:.25rem;font:inherit;
}
.sorane-contact textarea{min-height:10rem;resize:vertical}
.sorane-contact button{min-height:44px;padding:.65rem 1rem;border:1px solid var(--link,#0017c1);
  border-radius:.25rem;color:white;background:var(--link,#0017c1);font:inherit;cursor:pointer}
.sorane-contact button:disabled{opacity:.65;cursor:default}
.sorane-contact :is(input,textarea,button):focus-visible{outline:2px solid var(--focus-ring,#0017c1);outline-offset:2px}
.sorane-contact [data-sorane-contact-status]{overflow-wrap:anywhere}
`;
export const CONTACT_CSS_FILE = `contact-${createHash("sha256").update(CONTACT_CSS).digest("hex").slice(0,16)}.css`;
export function contactStyleHead(rootPrefix: string) {
  return `<link rel="stylesheet" href="${escape(rootPrefix)}assets/${CONTACT_CSS_FILE}">`;
}

export function renderContactForm(contact: NonNullable<ReturnType<typeof resolveContact>>, rootPrefix: string): string {
  return `<section class="sorane-contact"><h2>問い合わせ</h2>
<form data-sorane-contact data-webmcp-contact method="post" action="${escape(contact.endpoint)}" accept-charset="UTF-8">
<p><label>お名前（任意）<br><input name="name" autocomplete="name" maxlength="${CONTACT_LIMITS.name}"></label></p>
<p><label>返信先メールアドレス<br><input name="email" type="email" autocomplete="email" required maxlength="${CONTACT_LIMITS.email}"></label></p>
<p><label>件名<br><input name="subject" required maxlength="${CONTACT_LIMITS.subject}"></label></p>
<p><label>お問い合わせ内容<br><textarea name="body" rows="8" cols="40" required maxlength="${CONTACT_LIMITS.body}"></textarea></label></p>
<p>${escape(contact.notice)}</p>
<p><label><input type="checkbox" name="consent" value="yes" required>上記の個人情報の取り扱いに同意します</label></p>
<div hidden aria-hidden="true"><label>この欄は空欄にしてください<input name="website" tabindex="-1" autocomplete="off"></label></div>
<input type="hidden" name="request_id" value="">
<button type="submit">問い合わせを送信</button>
<p data-sorane-contact-status role="status" aria-live="polite" aria-atomic="true"></p>
</form><script src="${escape(rootPrefix)}assets/${CONTACT_SCRIPT_FILE}" defer></script></section>`;
}
