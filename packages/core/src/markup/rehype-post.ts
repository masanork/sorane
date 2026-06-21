import type { Root as HastRoot } from "hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { SlugLedger } from "../heading-slug.ts";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { rehypeDiagramPre } from "../diagrams/rehype-diagram-pre.ts";
import { sanitizeSchema, type TocEntry } from "./sanitize-schema.ts";

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

/** Pandoc HTML 断片に見出し id・アンカー・sanitize を適用する。 */
export function rehypePostProcess(html: string, outline: TocEntry[]): string {
  return unified()
    .use(rehypeParse, { fragment: true })
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
    .use(rehypeStringify)
    .processSync(html)
    .toString();
}