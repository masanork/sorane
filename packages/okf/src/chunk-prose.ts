/**
 * Canonical prose chunker for OKFC §5.3 markdown and site search.
 *
 * Split on ## / ### (mdast: fence-safe). Shared by OKFC pack and @sorane/search
 * so chunk text + heading paths stay identical across search surfaces.
 */

import { createHash } from "node:crypto";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, Heading, Table, TableRow, TableCell } from "mdast";

export const PROSE_MIN_BODY = 50;
export const PROSE_MAX_BODY = 800;

export interface ProseChunk {
  readonly text: string;
  readonly heading_path: string;
  readonly heading_slug: string;
  readonly chunk_format: "text";
}

/** SHA-256 hex of chunk text (align embed/cache keys). */
export function hashChunkText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function slugifyHeading(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "section";
}

class SlugLedger {
  private readonly used = new Map<string, number>();

  next(text: string): string {
    const base = slugifyHeading(text);
    const count = this.used.get(base) ?? 0;
    this.used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  }
}

function nodeToText(node: RootContent | Heading): string {
  const anyNode = node as { type: string; value?: string; children?: RootContent[] };
  if (anyNode.type === "text" || anyNode.type === "inlineCode") return anyNode.value ?? "";
  if (anyNode.children) return anyNode.children.map((c) => nodeToText(c as RootContent)).join("");
  return "";
}

function tableToText(node: Table): string {
  return node.children
    .map((row) =>
      (row as TableRow).children
        .map((cell) => nodeToText(cell as TableCell))
        .join(" | "),
    )
    .join("\n");
}

function blockToText(node: RootContent): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
      return nodeToText(node);
    case "list":
      return node.children.map((li) => nodeToText(li as RootContent)).join("\n");
    case "table":
      return tableToText(node);
    case "code":
      return node.value ?? "";
    case "html":
    case "thematicBreak":
      return "";
    default:
      return nodeToText(node);
  }
}

function splitOversized(body: string, maxBody: number): string[] {
  if (body.length <= maxBody) return [body];
  const parts: string[] = [];
  for (const para of body.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    const last = parts[parts.length - 1];
    if (last === undefined || last.length + p.length + 2 > maxBody) parts.push(p);
    else parts[parts.length - 1] = `${last}\n\n${p}`;
  }
  return parts.length ? parts : [body];
}

export interface ChunkProseOptions {
  readonly minChars?: number;
  readonly maxChars?: number;
}

/**
 * Split markdown body into prose chunks (OKFC §5.3 / search index).
 * `conceptTitle` is used as the root of `heading_path`.
 */
export function chunkProseMarkdown(
  body: string,
  conceptTitle: string,
  opts: ChunkProseOptions = {},
): ProseChunk[] {
  const minChars = opts.minChars ?? PROSE_MIN_BODY;
  const maxChars = opts.maxChars ?? PROSE_MAX_BODY;
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const ledger = new SlugLedger();
  const out: ProseChunk[] = [];

  interface Section {
    heading: Heading | null;
    body: RootContent[];
  }
  const sections: Section[] = [];
  let current: Section = { heading: null, body: [] };
  for (const node of tree.children) {
    if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
      if (current.heading || current.body.length) sections.push(current);
      current = { heading: node, body: [] };
    } else if (node.type === "heading" && node.depth === 1) {
      if (current.heading || current.body.length) sections.push(current);
      current = { heading: null, body: [] };
    } else {
      current.body.push(node);
    }
  }
  if (current.heading || current.body.length) sections.push(current);

  let lastH2 = "";
  for (const sec of sections) {
    const headingText = sec.heading ? nodeToText(sec.heading).trim() : "";
    const slug = headingText ? ledger.next(headingText) : "";
    let path: string;
    if (sec.heading?.depth === 2) {
      lastH2 = headingText;
      path = [conceptTitle, headingText].filter(Boolean).join(" / ");
    } else if (sec.heading?.depth === 3) {
      path = [conceptTitle, lastH2, headingText].filter(Boolean).join(" / ");
    } else {
      path = conceptTitle;
    }

    const bodyText = sec.body.map(blockToText).filter(Boolean).join("\n\n").trim();
    if (bodyText.length < minChars) continue;

    for (const part of splitOversized(bodyText, maxChars)) {
      if (part.trim().length < minChars) continue;
      out.push({
        text: part.trim(),
        heading_path: path,
        heading_slug: slug,
        chunk_format: "text",
      });
    }
  }

  // No ##/### sections (or all too short): one or more whole-body chunks.
  if (out.length === 0) {
    const flat = tree.children
      .map((n) => blockToText(n as RootContent))
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (flat.length > 0) {
      const parts =
        flat.length < minChars ? [flat] : splitOversized(flat, maxChars);
      for (const part of parts) {
        const t = part.trim();
        if (t.length === 0) continue;
        if (t.length < minChars && parts.length > 1) continue;
        out.push({
          text: t,
          heading_path: conceptTitle,
          heading_slug: slugifyHeading(conceptTitle) || "body",
          chunk_format: "text",
        });
      }
    }
  }

  return out;
}
