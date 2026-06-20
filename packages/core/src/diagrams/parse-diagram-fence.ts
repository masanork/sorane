import type { Code, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { DiagramsConfig } from "../config.ts";

export type MermaidKind =
  | "flowchart"
  | "sequenceDiagram"
  | "stateDiagram"
  | "erDiagram"
  | "gantt"
  | "pie"
  | "classDiagram";

export type MermaidKindOrUnsupported = MermaidKind | "unsupported";

const ALT_DOUBLE = /\balt="((?:[^"\\]|\\.)*)"/;
const ALT_SINGLE = /\balt='((?:[^'\\]|\\.)*)'/;

export function parseInfoString(meta: string | null | undefined): { alt?: string } {
  if (meta === null || meta === undefined) return {};
  const m = ALT_DOUBLE.exec(meta) ?? ALT_SINGLE.exec(meta);
  if (m === null) return {};
  const value = m[1] ?? "";
  if (value.length === 0) return {};
  return { alt: value };
}

const ALT_COMMENT = /^\s*%%\s*alt\s*:\s*(.+?)\s*$/m;

export function parseAltComment(source: string): string | undefined {
  const m = ALT_COMMENT.exec(source);
  if (m === null) return undefined;
  const value = m[1]!.trim();
  return value.length > 0 ? value : undefined;
}

export function detectDiagramKind(source: string): MermaidKindOrUnsupported {
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith("%%")) continue;
    if (line.startsWith("flowchart") || line.startsWith("graph")) return "flowchart";
    if (line.startsWith("sequenceDiagram")) return "sequenceDiagram";
    if (line.startsWith("stateDiagram")) return "stateDiagram";
    if (line.startsWith("erDiagram")) return "erDiagram";
    if (line.startsWith("gantt")) return "gantt";
    if (line.startsWith("pie")) return "pie";
    if (line.startsWith("classDiagram")) return "classDiagram";
    return "unsupported";
  }
  return "unsupported";
}

export function extractAltText(
  meta: string | null | undefined,
  source: string,
): string | undefined {
  return parseInfoString(meta).alt ?? parseAltComment(source);
}

export interface SoraneDiagramMeta {
  readonly lang: "mermaid" | "d2";
  readonly altText?: string;
  readonly kind?: MermaidKindOrUnsupported | "d2";
}

function annotateDiagramCode(node: Code, lang: "mermaid" | "d2"): void {
  const altText = extractAltText(node.meta, node.value);
  const kind = lang === "mermaid" ? detectDiagramKind(node.value) : "d2";
  const data = (node.data ?? {}) as Record<string, unknown>;
  node.data = {
    ...data,
    hProperties: { dataSoraneAlt: altText ?? "" },
    soraneDiagram: { lang, altText, kind } satisfies SoraneDiagramMeta,
  } as Code["data"];
}

/** remark プラグイン: mermaid / d2 フェンスに alt と kind メタデータを付与する。 */
export function remarkDiagramFences(config: DiagramsConfig): Plugin<[], Root> {
  return () => (tree: Root) => {
    if (config.enabled === false) return;
    visit(tree, "code", (node) => {
      if (node.lang === "mermaid") {
        if (config.mermaid?.mode === "off") return;
        annotateDiagramCode(node, "mermaid");
        return;
      }
      if (node.lang === "d2") {
        if (config.d2?.enabled !== true) return;
        annotateDiagramCode(node, "d2");
      }
    });
  };
}