import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/** 相対 .md リンクを .html に書き換える。 */
export function rewriteLinks(markdown: string): string {
  return markdown.replace(
    /\]\(([^)]+)\)/g,
    (full, target: string) => {
      const trimmed = target.trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return full;
      if (trimmed.startsWith("#")) return full;
      const m = trimmed.match(/^([^#]*?)\.md(#.*)?$/i);
      if (!m) return full;
      return `](${m[1]}.html${m[2] ?? ""})`;
    },
  );
}

/** Markdown 本文をサニタイズ済み HTML に変換する。 */
export function renderMarkdown(markdown: string): string {
  const html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .processSync(rewriteLinks(markdown))
    .toString();
  return html.replace(/\r\n?/g, "\n").trimEnd() + "\n";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}