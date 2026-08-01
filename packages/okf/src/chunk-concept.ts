/**
 * Type-aware concept chunking for Knowledge IR / OKFC / search (U2.1).
 *
 * Prose default: OKFC §5.3 via chunkProseMarkdown.
 * faq / glossary: ## sections (fence-safe), lower min length.
 * dataset: metadata overview chunk + body prose.
 * short reference / glossary-term: flat body fallback.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, Heading, Table, TableRow, TableCell } from "mdast";
import type { OkfConcept } from "./normalize.ts";
import {
  chunkProseMarkdown,
  PROSE_MAX_BODY,
  PROSE_MIN_BODY,
  type ProseChunk,
} from "./chunk-prose.ts";

export const CONCEPT_MIN_STRUCTURED = 12;

const STRUCTURED_DOC_TYPES = new Set(["faq", "glossary"]);
const H2_ANCHOR_SUFFIX_RE = /\s*\{#([^}]+)\}\s*$/;

export interface ConceptChunk {
  readonly text: string;
  readonly heading_path: string;
  readonly heading_slug: string;
  readonly chunk_format: "text" | "entry";
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

function parseH2HeadingLabel(node: Heading): string {
  const raw = nodeToText(node).trim();
  const m = H2_ANCHOR_SUFFIX_RE.exec(raw);
  if (m === null) return raw;
  return raw.slice(0, m.index).trim();
}

interface H2Section {
  readonly heading: string;
  readonly body: string;
  readonly slug: string;
}

/** mdast `##` split (fence-safe). */
function splitMdastH2Sections(body: string): H2Section[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const ledger = new SlugLedger();
  const sections: H2Section[] = [];
  let current: { heading: string; body: RootContent[] } | null = null;

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      if (current !== null) {
        const bodyText = current.body.map(blockToText).filter(Boolean).join("\n\n").trim();
        sections.push({
          heading: current.heading,
          body: bodyText,
          slug: ledger.next(current.heading),
        });
      }
      current = { heading: parseH2HeadingLabel(node), body: [] };
      continue;
    }
    if (current !== null) current.body.push(node);
  }

  if (current !== null) {
    const bodyText = current.body.map(blockToText).filter(Boolean).join("\n\n").trim();
    sections.push({
      heading: current.heading,
      body: bodyText,
      slug: ledger.next(current.heading),
    });
  }

  return sections;
}

function chunkStructuredSections(body: string, title: string): ConceptChunk[] {
  const sections = splitMdastH2Sections(body);
  if (sections.length === 0) return [];
  const out: ConceptChunk[] = [];
  for (const sec of sections) {
    const text = [sec.heading, sec.body].filter(Boolean).join("\n\n").trim();
    if (text.length < CONCEPT_MIN_STRUCTURED) continue;
    for (const part of splitOversized(text, PROSE_MAX_BODY)) {
      if (part.trim().length < CONCEPT_MIN_STRUCTURED) continue;
      out.push({
        text: part.trim(),
        heading_path: [title, sec.heading].filter(Boolean).join(" / "),
        heading_slug: sec.slug,
        chunk_format: "entry",
      });
    }
  }
  return out;
}

function datasetOverviewText(concept: OkfConcept): string {
  const fm = concept.frontmatter;
  const str = (k: string): string => {
    const v = fm[k];
    return v == null ? "" : String(v);
  };
  const parts: string[] = [concept.title, concept.description ?? ""];
  const publisher = fm.publisher;
  if (publisher !== null && typeof publisher === "object" && !Array.isArray(publisher)) {
    const name = (publisher as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) parts.push(`Publisher: ${name}`);
  }
  if (str("license")) parts.push(`License: ${str("license")}`);
  if (str("theme")) parts.push(`Theme: ${str("theme")}`);
  const distributions = fm.distributions;
  if (Array.isArray(distributions)) {
    for (const item of distributions) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
      const dTitle = (item as { title?: unknown }).title;
      const format = (item as { format?: unknown }).format;
      if (typeof dTitle === "string" && typeof format === "string") {
        parts.push(`Distribution: ${dTitle} (${format})`);
      }
    }
  }
  return parts.filter(Boolean).join("\n");
}

function proseToConceptChunks(prose: readonly ProseChunk[]): ConceptChunk[] {
  return prose.map((c) => ({
    text: c.text,
    heading_path: c.heading_path,
    heading_slug: c.heading_slug,
    chunk_format: "text" as const,
  }));
}

function flatBodyFallback(body: string, title: string): ConceptChunk[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const flat = tree.children
    .map((n) => blockToText(n as RootContent))
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (flat.length < CONCEPT_MIN_STRUCTURED) return [];
  return [
    {
      text: flat,
      heading_path: title,
      heading_slug: "",
      chunk_format: "text",
    },
  ];
}

/**
 * Chunk an OKF concept for Knowledge IR / OKFC pack / search projection.
 */
export function chunkConceptBody(concept: OkfConcept): ConceptChunk[] {
  const title = concept.title || concept.type;
  const body = concept.body ?? "";

  if (STRUCTURED_DOC_TYPES.has(concept.type)) {
    const structured = chunkStructuredSections(body, title);
    if (structured.length > 0) return structured;
  }

  let chunks = proseToConceptChunks(
    chunkProseMarkdown(body, title, {
      minChars: PROSE_MIN_BODY,
      maxChars: PROSE_MAX_BODY,
    }),
  );

  if (
    chunks.length === 0 &&
    (concept.type === "reference" || concept.type === "glossary-term") &&
    body.trim().length > 0
  ) {
    chunks = flatBodyFallback(body, title);
  }

  if (concept.type === "dataset") {
    const overview = datasetOverviewText(concept).trim();
    if (overview.length >= CONCEPT_MIN_STRUCTURED) {
      const overviewChunk: ConceptChunk = {
        text: overview,
        heading_path: title,
        heading_slug: "",
        chunk_format: "text",
      };
      return [overviewChunk, ...chunks];
    }
  }

  return chunks;
}
