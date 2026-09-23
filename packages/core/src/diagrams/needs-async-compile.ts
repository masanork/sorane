import type { DiagramsConfig } from "../config.ts";
import { isMermaidBuildEnabled } from "./compile-mermaid.ts";

export function needsAsyncDiagramCompile(config?: DiagramsConfig): boolean {
  return isMermaidBuildEnabled(config);
}
