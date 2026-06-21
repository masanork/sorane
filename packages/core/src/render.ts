import type { DiagramsConfig } from "./config.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "./config.ts";
import {
  countDiagramsForConfig,
  type DiagramRenderMeta,
} from "./diagrams/diagram-meta.ts";
import type { GlossaryLinkIndex } from "./markup/glossary-link-index.ts";
import { processMarkdownToMdast } from "./markup/process-markdown.ts";
import { renderMdastToHtml } from "./markup/render-mdast.ts";
import type { TocEntry } from "./markup/sanitize-schema.ts";

export { sanitizeSchema, type TocEntry } from "./markup/sanitize-schema.ts";

export interface RenderOptions {
  readonly diagrams?: DiagramsConfig;
  readonly glossaryIndex?: GlossaryLinkIndex;
}

export interface RenderedMarkdown {
  readonly html: string;
  readonly outline: readonly TocEntry[];
  readonly diagrams?: DiagramRenderMeta;
}

export type { DiagramRenderMeta };

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
  const diagrams: DiagramRenderMeta = { mermaid: 0, d2: 0, graphviz: 0 };
  const tree = processMarkdownToMdast(rewriteLinks(markdown), {
    diagrams: diagramConfig,
    glossaryIndex: opts?.glossaryIndex,
  });
  Object.assign(diagrams, countDiagramsForConfig(tree, diagramConfig));
  const html = renderMdastToHtml(tree, outline);
  return {
    html,
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