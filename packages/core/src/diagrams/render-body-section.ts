import type { TocEntry } from "../render.ts";
import { renderMarkdownDocument, type RenderOptions } from "../render.ts";
import type { DiagramRenderMeta } from "./diagram-meta.ts";
import { emptyDiagramMeta } from "./diagram-meta.ts";

export interface BodySectionResult {
  readonly html: string;
  readonly diagrams: DiagramRenderMeta;
  readonly outline: readonly TocEntry[];
}

export function renderBodySection(
  markdown: string,
  opts?: RenderOptions,
): BodySectionResult {
  const rendered = renderMarkdownDocument(markdown, opts);
  return {
    html: rendered.html,
    diagrams: rendered.diagrams ?? emptyDiagramMeta(),
    outline: rendered.outline,
  };
}