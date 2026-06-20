import type { Root as HastRoot, Element } from "hast";
import { visit } from "unist-util-visit";

function classNames(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) {
    return value.flatMap((v) => (typeof v === "string" ? v.split(/\s+/) : []));
  }
  return [];
}

function isDiagramCode(node: Element): boolean {
  const cls = classNames(node.properties?.className);
  return cls.includes("language-mermaid") || cls.includes("language-d2");
}

/** `pre > code.language-mermaid|d2` の alt を親 `pre` の data-sorane-alt へ移す。 */
export function rehypeDiagramPre() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code || !isDiagramCode(code)) return;
      const alt = code.properties?.dataSoraneAlt;
      if (typeof alt === "string" && alt.length > 0) {
        node.properties ??= {};
        node.properties.dataSoraneAlt = alt;
        delete code.properties?.dataSoraneAlt;
      }
    });
  };
}