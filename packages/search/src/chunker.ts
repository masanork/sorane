import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, Heading, Table, TableRow, TableCell } from "mdast";
import { extract } from "@sorane/okf";
import { parseYaml } from "@sorane/okf";
import { SlugLedger } from "./heading-slug.ts";

export const MIN_BODY = 50;
export const MIN_BODY_STRUCTURED = 12;
export const MAX_BODY = 800;

const STRUCTURED_DOC_TYPES = new Set(["faq", "glossary"]);
const H2_SECTION_RE = /^##\s+(.+?)(?:\s*\{#([^}]+)\})?\s*$/;
const FENCE_OPEN_RE = /^(```+|~~~+)/;

export interface Chunk {
  readonly source: string;
  readonly chunkIndex: number;
  readonly text: string;
  readonly headingPath: string;
  readonly headingSlug: string;
  readonly docType: string;
  readonly title: string;
  readonly timestamp: string;
  readonly tags: string;
}

interface Meta {
  docType: string;
  title: string;
  timestamp: string;
  tags: string;
  skip: boolean;
}

function nodeToText(node: RootContent | Heading): string {
  const anyNode = node as { type: string; value?: string; children?: RootContent[] };
  if (anyNode.type === "text" || anyNode.type === "inlineCode") return anyNode.value ?? "";
  if (anyNode.children) return anyNode.children.map((c) => nodeToText(c as RootContent)).join("");
  return "";
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
    case "html":
    case "thematicBreak":
      return "";
    default:
      return nodeToText(node);
  }
}

function splitOversized(body: string): string[] {
  if (body.length <= MAX_BODY) return [body];
  const parts: string[] = [];
  for (const para of body.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    const last = parts[parts.length - 1];
    if (last === undefined || last.length + p.length + 2 > MAX_BODY) parts.push(p);
    else parts[parts.length - 1] = last + "\n\n" + p;
  }
  return parts.length ? parts : [body];
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

function slugifyToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function slugifyTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readMeta(frontmatter: string | null): Meta {
  const fm = (frontmatter ? (parseYaml(frontmatter) as Record<string, unknown>) : {}) ?? {};
  const str = (k: string): string => {
    const v = fm[k];
    return v == null ? "" : String(v);
  };
  const rawTags = fm.tags;
  const tagSlugs =
    Array.isArray(rawTags)
      ? rawTags.map((t) => slugifyTag(String(t))).filter(Boolean)
      : typeof rawTags === "string"
        ? [slugifyTag(rawTags)].filter(Boolean)
        : [];
  let tags = tagSlugs.join(",");
  if (str("type") === "dataset") {
    const extra: string[] = [];
    const license = str("license");
    if (license) extra.push(`license:${slugifyToken(license)}`);
    const theme = str("theme");
    if (theme) extra.push(`theme:${slugifyToken(theme)}`);
    const distributions = fm.distributions;
    if (Array.isArray(distributions)) {
      for (const item of distributions) {
        if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
        const format = (item as { format?: unknown }).format;
        if (typeof format === "string" && format.length > 0) {
          extra.push(`format:${slugifyToken(format)}`);
        }
      }
    }
    if (extra.length > 0) {
      tags = tags.length > 0 ? `${tags},${extra.join(",")}` : extra.join(",");
    }
  }

  return {
    docType: str("type"),
    title: str("title"),
    timestamp: str("timestamp"),
    tags,
    skip: fm.isSystem === true,
  };
}

function chunkBody(body: string, meta: Meta): { text: string; path: string; slug: string }[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const ledger = new SlugLedger();
  const out: { text: string; path: string; slug: string }[] = [];

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
      path = [meta.title, headingText].filter(Boolean).join(" / ");
    } else if (sec.heading?.depth === 3) {
      path = [meta.title, lastH2, headingText].filter(Boolean).join(" / ");
    } else {
      path = meta.title;
    }

    const bodyText = sec.body.map(blockToText).filter(Boolean).join("\n\n").trim();
    if (bodyText.length < MIN_BODY) continue;

    for (const part of splitOversized(bodyText)) {
      if (part.trim().length < MIN_BODY) continue;
      out.push({ text: part.trim(), path, slug });
    }
  }
  return out;
}

interface H2Section {
  readonly heading: string;
  readonly body: string;
  readonly slug: string;
}

function parseH2Sections(body: string): H2Section[] {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";
  const sections: { heading: string; bodyLines: string[] }[] = [];
  let current: { heading: string; bodyLines: string[] } | null = null;
  const ledger = new SlugLedger();

  for (const line of lines) {
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (line.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      if (current) current.bodyLines.push(line);
      continue;
    }
    if (inFence) {
      if (current) current.bodyLines.push(line);
      continue;
    }
    const hm = H2_SECTION_RE.exec(line);
    if (hm) {
      if (current) sections.push(current);
      current = {
        heading: hm[1]!.replace(/\s*\{#[^}]+\}\s*$/, "").trim(),
        bodyLines: [],
      };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  if (current) sections.push(current);

  return sections.map((s) => ({
    heading: s.heading,
    body: s.bodyLines.join("\n").trim(),
    slug: ledger.next(s.heading),
  }));
}

function chunkStructuredSections(body: string, meta: Meta): Chunk[] {
  const sections = parseH2Sections(body);
  if (sections.length === 0) return [];
  const out: Chunk[] = [];
  let index = 0;
  for (const sec of sections) {
    const text = [sec.heading, sec.body].filter(Boolean).join("\n\n").trim();
    if (text.length < MIN_BODY_STRUCTURED) continue;
    for (const part of splitOversized(text)) {
      if (part.trim().length < MIN_BODY_STRUCTURED) continue;
      out.push({
        source: "",
        chunkIndex: index++,
        text: part.trim(),
        headingPath: [meta.title, sec.heading].filter(Boolean).join(" / "),
        headingSlug: sec.slug,
        docType: meta.docType,
        title: meta.title,
        timestamp: meta.timestamp,
        tags: meta.tags,
      });
    }
  }
  return out;
}

function datasetOverviewText(fm: Record<string, unknown>, meta: Meta): string {
  const str = (k: string): string => {
    const v = fm[k];
    return v == null ? "" : String(v);
  };
  const parts: string[] = [meta.title, str("description")];
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
      const title = (item as { title?: unknown }).title;
      const format = (item as { format?: unknown }).format;
      if (typeof title === "string" && typeof format === "string") {
        parts.push(`Distribution: ${title} (${format})`);
      }
    }
  }
  return parts.filter(Boolean).join("\n");
}

function isNotFoundPath(relPath: string): boolean {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "") === "404";
}

function finalizeChunks(
  relPath: string,
  meta: Meta,
  raw: { text: string; path: string; slug: string }[],
): Chunk[] {
  return raw.map((c, i) => ({
    source: relPath,
    chunkIndex: i,
    text: c.text,
    headingPath: c.path,
    headingSlug: c.slug,
    docType: meta.docType,
    title: meta.title,
    timestamp: meta.timestamp,
    tags: meta.tags,
  }));
}

/** 1 文書を検索チャンク列へ。 */
export function chunkDocument(source: string, relPath: string): Chunk[] {
  const { frontmatter, body } = extract(source);
  const meta = readMeta(frontmatter);
  if (meta.skip || isNotFoundPath(relPath)) return [];

  const fm =
    frontmatter !== null && frontmatter.length > 0
      ? ((parseYaml(frontmatter) as Record<string, unknown>) ?? {})
      : {};

  if (STRUCTURED_DOC_TYPES.has(meta.docType)) {
    const structured = chunkStructuredSections(body, meta).map((c, i) => ({
      ...c,
      source: relPath,
      chunkIndex: i,
    }));
    if (structured.length > 0) return structured;
  }

  let bodyChunks = chunkBody(body, meta);
  if (
    bodyChunks.length === 0 &&
    (meta.docType === "reference" || meta.docType === "glossary-term") &&
    body.trim().length > 0
  ) {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
    const flat = tree.children
      .map((n) => blockToText(n as RootContent))
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (flat.length >= MIN_BODY_STRUCTURED) {
      bodyChunks = [{ text: flat, path: meta.title, slug: "" }];
    }
  }
  const chunks = finalizeChunks(relPath, meta, bodyChunks);

  if (meta.docType === "dataset") {
    const overview = datasetOverviewText(fm, meta).trim();
    if (overview.length >= MIN_BODY_STRUCTURED) {
      const overviewChunk: Chunk = {
        source: relPath,
        chunkIndex: 0,
        text: overview,
        headingPath: meta.title,
        headingSlug: "",
        docType: meta.docType,
        title: meta.title,
        timestamp: meta.timestamp,
        tags: meta.tags,
      };
      return [
        overviewChunk,
        ...chunks.map((c, i) => ({ ...c, chunkIndex: i + 1 })),
      ];
    }
  }

  return chunks;
}