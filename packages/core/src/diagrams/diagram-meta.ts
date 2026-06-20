import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import type { DiagramsConfig } from "../config.ts";
import { buildMermaidHead } from "./mermaid-head.ts";

export interface DiagramRenderMeta {
  readonly mermaid: number;
  readonly d2: number;
}

export function emptyDiagramMeta(): DiagramRenderMeta {
  return { mermaid: 0, d2: 0 };
}

export function mergeDiagramMeta(
  a: DiagramRenderMeta,
  b: DiagramRenderMeta,
): DiagramRenderMeta {
  return {
    mermaid: a.mermaid + b.mermaid,
    d2: a.d2 + b.d2,
  };
}

export function countDiagramsForConfig(
  tree: Root,
  config: DiagramsConfig,
): DiagramRenderMeta {
  let mermaid = 0;
  let d2 = 0;
  if (config.enabled === false) return { mermaid, d2 };
  visit(tree, "code", (node) => {
    if (node.lang === "mermaid" && resolveMermaidMode(config) !== "off") {
      mermaid += 1;
    } else if (node.lang === "d2" && config.d2?.enabled === true) {
      d2 += 1;
    }
  });
  return { mermaid, d2 };
}

export function resolveMermaidMode(config: DiagramsConfig): "client" | "off" {
  if (config.enabled === false) return "off";
  const mode = config.mermaid?.mode ?? "client";
  if (mode === "off") return "off";
  return "client";
}

export function diagramHeadForPage(
  meta: DiagramRenderMeta,
  rootPrefix: string,
  config: DiagramsConfig,
): string | undefined {
  if (config.enabled === false) return undefined;
  if (meta.mermaid === 0) return undefined;
  if (resolveMermaidMode(config) === "off") return undefined;
  return buildMermaidHead(rootPrefix);
}