import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, Heading } from "mdast";
import { extract } from "@sorane/okf";
import { parseYaml } from "@sorane/okf";
import { SlugLedger } from "./heading-slug.ts";

export const MIN_BODY = 50;
export const MAX_BODY = 800;

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
    case "code":
    case "table":
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
  return {
    docType: str("type"),
    title: str("title"),
    timestamp: str("timestamp"),
    tags: tagSlugs.join(","),
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

function isNotFoundPath(relPath: string): boolean {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "") === "404";
}

/** 1 文書を検索チャンク列へ。 */
export function chunkDocument(source: string, relPath: string): Chunk[] {
  const { frontmatter, body } = extract(source);
  const meta = readMeta(frontmatter);
  if (meta.skip || isNotFoundPath(relPath)) return [];

  const raw = chunkBody(body, meta);
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