import { escapeHtml } from "../render.ts";

export function buildMermaidHead(rootPrefix: string): string {
  const src = `${rootPrefix}assets/diagrams/sorane-mermaid-loader.mjs`;
  return `<script type="module" src="${escapeHtml(src)}"></script>`;
}