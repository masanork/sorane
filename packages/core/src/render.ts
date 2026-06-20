import type { Schema } from "hast-util-sanitize";
import type { Root as HastRoot } from "hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { SlugLedger } from "@sorane/search";
import type { DiagramsConfig } from "./config.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "./config.ts";
import {
  countDiagramsForConfig,
  type DiagramRenderMeta,
} from "./diagrams/diagram-meta.ts";
import { remarkDiagramFences } from "./diagrams/parse-diagram-fence.ts";
import { rehypeDiagramPre } from "./diagrams/rehype-diagram-pre.ts";
import rehypeStringify from "rehype-stringify";
import type { Root as MdastRoot } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const schemaAttributes = defaultSchema.attributes ?? {};

/** はてな移行記事の HTML を許可しつつ script 等は落とす。 */
export const sanitizeSchema: Schema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...schemaAttributes,
    a: [
      ...(schemaAttributes.a ?? []).filter(
        (entry) => (typeof entry === "string" ? entry : entry[0]) !== "className",
      ),
      "title",
      ["className", "data-footnote-backref", "keyword", "okeyword", "heading-anchor"],
    ],
    h1: [...(schemaAttributes.h1 ?? []), "id"],
    h2: [...(schemaAttributes.h2 ?? []), "id"],
    h3: [...(schemaAttributes.h3 ?? []), "id"],
    h4: [...(schemaAttributes.h4 ?? []), "id"],
    h5: [...(schemaAttributes.h5 ?? []), "id"],
    h6: [...(schemaAttributes.h6 ?? []), "id"],
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
    figure: [
      [
        "className",
        "figure-image",
        "figure-image-fotolife",
        "mceNonEditable",
        "diagram",
        "diagram--d2",
        "diagram--mermaid",
      ],
      "role",
    ],
    figcaption: [],
    iframe: ["src", "width", "height", "frameBorder", "allowFullScreen"],
    embed: ["src", "type", "width", "height"],
    object: ["width", "height"],
    param: ["name", "value"],
    img: [...(schemaAttributes.img ?? []), "title", "loading", "decoding"],
    pre: [...(schemaAttributes.pre ?? []), "dataSoraneAlt"],
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

export interface TocEntry {
  readonly depth: number;
  readonly id: string;
  readonly text: string;
}

export interface RenderOptions {
  readonly diagrams?: DiagramsConfig;
}

export interface RenderedMarkdown {
  readonly html: string;
  readonly outline: readonly TocEntry[];
  readonly diagrams?: DiagramRenderMeta;
}

export type { DiagramRenderMeta };

function hastToPlainText(node: { type?: string; value?: string; children?: unknown[] }): string {
  if (node.type === "text" && typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children
    .map((child) => hastToPlainText(child as { type?: string; value?: string; children?: unknown[] }))
    .join("");
}

function rehypeHeadingIds() {
  const ledger = new SlugLedger();
  return (tree: HastRoot) => {
    visit(tree, "element", (node) => {
      const m = /^h([1-6])$/.exec(node.tagName);
      if (!m) return;
      const text = hastToPlainText(node).trim();
      if (!text) return;
      node.properties ??= {};
      node.properties.id = ledger.next(text);
    });
  };
}

function rehypeCollectOutline(outline: TocEntry[]) {
  return () => (tree: HastRoot) => {
    visit(tree, "element", (node) => {
      const m = /^h([2-4])$/.exec(node.tagName);
      if (!m) return;
      const id = node.properties?.id;
      if (typeof id !== "string" || id.length === 0) return;
      const text = hastToPlainText(node)
        .replace(/\s*#\s*$/, "")
        .trim();
      if (!text) return;
      outline.push({ depth: Number(m[1]), id, text });
    });
  };
}

function markdownPipeline(
  outline: TocEntry[],
  diagrams: DiagramRenderMeta,
  diagramConfig: DiagramsConfig,
) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDiagramFences(diagramConfig))
    .use(() => (tree: MdastRoot) => {
      Object.assign(diagrams, countDiagramsForConfig(tree, diagramConfig));
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeDiagramPre)
    .use(rehypeHeadingIds)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: {
        className: ["heading-anchor"],
        ariaHidden: "true",
        tabIndex: -1,
      },
      content: { type: "text", value: "#" },
    })
    .use(rehypeCollectOutline(outline))
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);
}

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

/** Markdown 本文をサニタイズ済み HTML と見出し outline に変換する。 */
export function renderMarkdownDocument(
  markdown: string,
  opts?: RenderOptions,
): RenderedMarkdown {
  const diagramConfig = opts?.diagrams ?? DEFAULT_DIAGRAMS_CONFIG;
  const outline: TocEntry[] = [];
  const diagrams: DiagramRenderMeta = { mermaid: 0, d2: 0 };
  const html = markdownPipeline(outline, diagrams, diagramConfig)
    .processSync(rewriteLinks(markdown))
    .toString()
    .replace(/\r\n?/g, "\n")
    .trimEnd();
  return {
    html: html.length > 0 ? `${html}\n` : "",
    outline,
    diagrams,
  };
}

/** Markdown 本文をサニタイズ済み HTML に変換する。 */
export function renderMarkdown(markdown: string, opts?: RenderOptions): string {
  return renderMarkdownDocument(markdown, opts).html;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}