import type { Plugin } from "unified";
import type { Root, Text, RootContent, Paragraph, ListItem, Heading, Blockquote } from "mdast";
import { visit, SKIP } from "unist-util-visit";

export interface TermLinkNode {
  readonly type: "termLink";
  readonly termId: string;
  readonly label?: string;
  readonly position?: import("unist").Position;
}

declare module "mdast" {
  interface PhrasingContentMap {
    termLink: TermLinkNode;
  }
  interface RootContentMap {
    termLink: TermLinkNode;
  }
}

type TermLinkParent = Paragraph | ListItem | Heading | Blockquote;

const TERM_LINK_RE = /\[\[term:([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export const parseTermLinkPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      const replacements = parseTextNode(node as Text);
      if (replacements === null) return;
      const childrenAny = (parent as TermLinkParent).children as unknown as RootContent[];
      childrenAny.splice(index, 1, ...(replacements as unknown as RootContent[]));
      return [SKIP, index + replacements.length];
    });
  };
};

function parseTextNode(node: Text): Array<Text | TermLinkNode> | null {
  const value = node.value;
  if (!value.includes("[[term:")) return null;

  const out: Array<Text | TermLinkNode> = [];
  let lastEnd = 0;

  for (const m of value.matchAll(TERM_LINK_RE)) {
    const start = m.index ?? 0;
    const full = m[0]!;
    const termId = m[1]!.trim();
    const labelRaw = m[2];
    if (termId.length === 0) continue;
    if (start > lastEnd) {
      out.push({ type: "text", value: value.slice(lastEnd, start) });
    }
    const label = typeof labelRaw === "string" && labelRaw.length > 0 ? labelRaw : undefined;
    out.push({
      type: "termLink",
      termId,
      label,
      position: node.position,
    } as TermLinkNode);
    lastEnd = start + full.length;
  }

  if (out.length === 0) return null;
  if (lastEnd < value.length) {
    out.push({ type: "text", value: value.slice(lastEnd) });
  }
  return out;
}