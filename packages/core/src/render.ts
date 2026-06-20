import type { Schema } from "hast-util-sanitize";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const schemaAttributes = defaultSchema.attributes ?? {};

/** はてな移行記事の HTML を許可しつつ script 等は落とす。 */
const sanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...schemaAttributes,
    a: [
      ...(schemaAttributes.a ?? []).filter(
        (entry) => (typeof entry === "string" ? entry : entry[0]) !== "className",
      ),
      "title",
      ["className", "data-footnote-backref", "keyword", "okeyword"],
    ],
    blockquote: [
      ...(schemaAttributes.blockquote ?? []),
      ["className", "twitter-tweet"],
      "dataLang",
      "dataDnt",
      "dataConversation",
    ],
    span: [
      ...(schemaAttributes.span ?? []),
      ["style", /^font-style:\s*italic;?$/i],
    ],
    figure: [["className", "figure-image", "figure-image-fotolife", "mceNonEditable"]],
    figcaption: [],
    iframe: ["src", "width", "height", "frameBorder", "allowFullScreen"],
    embed: ["src", "type", "width", "height"],
    object: ["width", "height"],
    param: ["name", "value"],
    img: [...(schemaAttributes.img ?? []), "title"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "center",
    "embed",
    "figcaption",
    "figure",
    "iframe",
    "object",
    "param",
  ],
};

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

/** ヘッダ h1 と重複する先頭 `# title` 行を除く。 */
export function stripDuplicateTitleHeading(markdown: string, title: string): string {
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) return markdown;
  const m = lines[i].match(/^#\s+(.+)$/);
  if (!m || m[1].trim() !== title.trim()) return markdown;
  const rest = [...lines.slice(0, i), ...lines.slice(i + 1)];
  if (rest[i]?.trim() === "") rest.splice(i, 1);
  return rest.join("\n");
}

/** Markdown 本文をサニタイズ済み HTML に変換する。 */
export function renderMarkdown(markdown: string): string {
  const html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
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