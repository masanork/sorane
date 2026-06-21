/** import 時に危険な HTML 埋め込みを除去する。 */

const STRIP_TAGS = ["script", "iframe", "embed", "object", "link", "meta", "base"] as const;

export function stripUnsafeHtmlEmbeds(html: string): string {
  let out = html;
  for (const tag of STRIP_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    out = out.replace(re, "");
    const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    out = out.replace(selfClosing, "");
  }
  out = out.replace(/\s+on\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  return out;
}