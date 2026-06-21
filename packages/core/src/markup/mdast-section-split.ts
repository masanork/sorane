import type { Heading, Root, RootContent } from "mdast";
import { processMarkdownToMdast } from "./process-markdown.ts";
import { mdastNodeToPlainText } from "./mdast-plaintext.ts";
import { mdastNodesToMarkdown } from "./mdast-to-source.ts";

const ANCHOR_SUFFIX_RE = /\s*\{#([^}]+)\}\s*$/;

export interface MdastSection {
  readonly label: string;
  readonly anchorId?: string;
  readonly line: number;
  readonly bodyNodes: readonly RootContent[];
  readonly bodyMarkdown: string;
}

export interface MdastSectionSplitResult {
  readonly sections: readonly MdastSection[];
  readonly preambleMarkdown: string;
  readonly preambleLine?: number;
}

function parseHeadingLabel(node: Heading): {
  readonly text: string;
  readonly anchorId?: string;
  readonly line: number;
} {
  const raw = node.children.map((c) => mdastNodeToPlainText(c)).join("").trim();
  const m = ANCHOR_SUFFIX_RE.exec(raw);
  const line = node.position?.start.line ?? 1;
  if (m === null) return { text: raw, line };
  return {
    text: raw.slice(0, m.index).trim(),
    anchorId: m[1],
    line,
  };
}

function preambleLineFrom(nodes: readonly RootContent[]): number | undefined {
  for (const node of nodes) {
    const text = mdastNodeToPlainText(node).trim();
    if (text.length === 0) continue;
    const line = node.position?.start.line;
    if (typeof line === "number") return line;
  }
  return undefined;
}

/** mdast を depth=2 見出しで分割する（FAQ / glossary 共通）。 */
export function splitMdastOnH2(tree: Root): MdastSectionSplitResult {
  const preamble: RootContent[] = [];
  const sections: MdastSection[] = [];
  let current: {
    label: string;
    anchorId?: string;
    line: number;
    body: RootContent[];
  } | null = null;

  for (const node of tree.children) {
    if (node.type === "heading" && (node as Heading).depth === 2) {
      if (current !== null) {
        sections.push({
          label: current.label,
          anchorId: current.anchorId,
          line: current.line,
          bodyNodes: current.body,
          bodyMarkdown: mdastNodesToMarkdown(current.body),
        });
      }
      const meta = parseHeadingLabel(node as Heading);
      current = {
        label: meta.text,
        anchorId: meta.anchorId,
        line: meta.line,
        body: [],
      };
      continue;
    }
    if (current === null) preamble.push(node);
    else current.body.push(node);
  }

  if (current !== null) {
    sections.push({
      label: current.label,
      anchorId: current.anchorId,
      line: current.line,
      bodyNodes: current.body,
      bodyMarkdown: mdastNodesToMarkdown(current.body),
    });
  }

  return {
    sections,
    preambleMarkdown: mdastNodesToMarkdown(preamble),
    preambleLine: preambleLineFrom(preamble),
  };
}

/** Markdown 本文を mdast 化して h2 分割する。 */
export function splitMarkdownOnH2(body: string): MdastSectionSplitResult {
  const tree = processMarkdownToMdast(body);
  return splitMdastOnH2(tree);
}