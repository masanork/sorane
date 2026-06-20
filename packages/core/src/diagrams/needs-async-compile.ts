import type { DiagramsConfig } from "../config.ts";
import { isD2CompileEnabled } from "./compile-d2.ts";
import { isGraphvizCompileEnabled } from "./compile-graphviz.ts";
import { isMermaidBuildEnabled } from "./compile-mermaid.ts";

export function needsAsyncDiagramCompile(config?: DiagramsConfig): boolean {
  return (
    isD2CompileEnabled(config) ||
    isMermaidBuildEnabled(config) ||
    isGraphvizCompileEnabled(config)
  );
}