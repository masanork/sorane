import type { Code, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { escapeHtml } from "../render.ts";

export type BuiltFigureVariant = "d2" | "mermaid" | "graphviz" | "plantuml";

export interface InjectedBuiltFigure {
  readonly src: string;
  readonly alt: string;
  readonly variant: BuiltFigureVariant;
}

/** ビルド時コンパイル済みフェンスを raw HTML figure に差し替える。 */
export function remarkInjectBuiltFigures(
  figures: ReadonlyMap<Code, InjectedBuiltFigure>,
): Plugin<[], Root> {
  return () => (tree: Root) => {
    visit(tree, "code", (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      const fig = figures.get(node);
      if (!fig) return;
      parent.children[index] = {
        type: "html",
        value:
          `<figure class="diagram diagram--${fig.variant}" role="img" aria-label="${escapeHtml(fig.alt)}">` +
          `<img src="${escapeHtml(fig.src)}" alt="${escapeHtml(fig.alt)}" loading="lazy" decoding="async" />` +
          `</figure>`,
      };
    });
  };
}