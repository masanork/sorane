import type { Link, Root } from "mdast";
import type { Plugin } from "unified";
import { visit, SKIP } from "unist-util-visit";
import type { GlossaryLinkIndex } from "./glossary-link-index.ts";
import type { TermLinkNode } from "./parse-term-link.ts";

export function resolveTermLinksPlugin(
  index: GlossaryLinkIndex | undefined,
): Plugin<[], Root> {
  return () => (tree: Root) => {
    if (!index || index.size === 0) return;
    visit(tree, "termLink", (node, indexPos, parent) => {
      if (parent === undefined || indexPos === undefined) return;
      const term = node as TermLinkNode;
      const entry = index.get(term.termId);
      if (entry === undefined) return;

      const linkText = term.label ?? entry.title;
      const link: Link = {
        type: "link",
        url: entry.href,
        title: entry.description ?? entry.title,
        children: [{ type: "text", value: linkText }],
        data: {
          hProperties: {
            className: ["glossary-term-link"],
            dataSoraneTerm: term.termId,
          },
        },
      };
      const children = parent.children as unknown[];
      children.splice(indexPos, 1, link);
      return [SKIP, indexPos + 1];
    });
  };
}