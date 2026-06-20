import type { Code, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { escapeHtml } from "../render.ts";

export interface InjectedD2Figure {
  readonly src: string;
  readonly alt: string;
}

/** コンパイル済み D2 フェンスを raw HTML figure に差し替える。 */
export function remarkInjectD2Figures(
  figures: ReadonlyMap<Code, InjectedD2Figure>,
): Plugin<[], Root> {
  return () => (tree: Root) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "d2" || parent === undefined || index === undefined) return;
      const fig = figures.get(node);
      if (!fig) return;
      parent.children[index] = {
        type: "html",
        value:
          `<figure class="diagram diagram--d2" role="img" aria-label="${escapeHtml(fig.alt)}">` +
          `<img src="${escapeHtml(fig.src)}" alt="${escapeHtml(fig.alt)}" loading="lazy" decoding="async" />` +
          `</figure>`,
      };
    });
  };
}