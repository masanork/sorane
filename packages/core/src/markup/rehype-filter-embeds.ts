import type { Root as HastRoot, Element } from "hast";
import { visit } from "unist-util-visit";
import { isSafeEmbedSrc } from "../safe-url.ts";

const EMBED_TAGS = new Set(["iframe", "embed", "object"]);

function srcFromNode(node: Element): string | undefined {
  const src = node.properties?.src;
  if (typeof src === "string" && src.length > 0) return src;
  return undefined;
}

/** iframe / embed / object の src を https のみに制限する。 */
export function rehypeFilterEmbeds() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      if (!EMBED_TAGS.has(node.tagName)) return;
      const src = srcFromNode(node);
      if (!src || !isSafeEmbedSrc(src)) {
        parent.children.splice(index, 1);
      }
    });
  };
}