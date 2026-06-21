import type { Root as MdastRoot } from "mdast";
import { mdastToPandoc } from "../ast/mdast-to-pandoc.ts";
import { pandocToHtml } from "../ast/pandoc-to-html.ts";
import type { TocEntry } from "./sanitize-schema.ts";
import { rehypePostProcess } from "./rehype-post.ts";

function normalizeHtml(html: string): string {
  return html.replace(/\r\n?/g, "\n").trimEnd();
}

/** mdast → Pandoc → HTML → rehype 後処理。 */
export function renderMdastToHtml(tree: MdastRoot, outline: TocEntry[]): string {
  const doc = mdastToPandoc(tree);
  const raw = pandocToHtml(doc, { sanitize: "strict" });
  const processed = rehypePostProcess(raw, outline);
  const normalized = normalizeHtml(processed);
  return normalized.length > 0 ? `${normalized}\n` : "";
}