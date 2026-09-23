import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import type { DiagramsConfig } from "../config.ts";
import { buildMermaidHead } from "./mermaid-head.ts";

export interface DiagramRenderMeta {
  readonly mermaid: number;
}

export function emptyDiagramMeta(): DiagramRenderMeta {
  return { mermaid: 0 };
}

export function mergeDiagramMeta(
  a: DiagramRenderMeta,
  b: DiagramRenderMeta,
): DiagramRenderMeta {
  return { mermaid: a.mermaid + b.mermaid };
}

export function countDiagramsForConfig(tree: Root, config: DiagramsConfig): DiagramRenderMeta {
  let mermaid = 0;
  if (config.enabled === false || config.mermaid?.mode === "off") return { mermaid };
  visit(tree, "code", (node) => {
    if (node.lang === "mermaid") mermaid += 1;
  });
  return { mermaid };
}

export type MermaidRenderMode = "client" | "build" | "off";

export function resolveMermaidMode(config: DiagramsConfig): MermaidRenderMode {
  if (config.enabled === false) return "off";
  const mode = config.mermaid?.mode ?? "client";
  if (mode === "off") return "off";
  return mode === "build" ? "build" : "client";
}

export function diagramHeadForPage(
  meta: DiagramRenderMeta,
  rootPrefix: string,
  config: DiagramsConfig,
): string | undefined {
  if (meta.mermaid === 0 || resolveMermaidMode(config) !== "client") return undefined;
  return buildMermaidHead(rootPrefix);
}

export function contentNeedsMermaidClient(
  hasMermaidFences: boolean,
  config: DiagramsConfig,
): boolean {
  return hasMermaidFences && resolveMermaidMode(config) === "client";
}
