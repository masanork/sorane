import type { TocEntry, RenderOptions } from "../render.ts";
import { renderMarkdownDocument } from "../render.ts";
import type { DiagramRenderMeta } from "./diagram-meta.ts";
import { emptyDiagramMeta } from "./diagram-meta.ts";
import { needsAsyncDiagramCompile } from "./needs-async-compile.ts";
import {
  renderMarkdownDocumentAsync,
  type AsyncRenderOptions,
} from "./render-async.ts";

export interface BodySectionResult {
  readonly html: string;
  readonly diagrams: DiagramRenderMeta;
  readonly outline: readonly TocEntry[];
}

export type BodySectionOptions = RenderOptions & AsyncRenderOptions;

export function renderBodySection(
  markdown: string,
  opts?: BodySectionOptions,
): BodySectionResult {
  const rendered = renderMarkdownDocument(markdown, opts);
  return {
    html: rendered.html,
    diagrams: rendered.diagrams ?? emptyDiagramMeta(),
    outline: rendered.outline,
  };
}

export async function renderBodySectionAsync(
  markdown: string,
  opts?: BodySectionOptions,
): Promise<BodySectionResult> {
  const rendered = await renderMarkdownDocumentAsync(markdown, opts);
  return {
    html: rendered.html,
    diagrams: rendered.diagrams ?? emptyDiagramMeta(),
    outline: rendered.outline,
  };
}

/** ビルド時コンパイルが必要なら非同期、それ以外は同期。 */
export async function renderBodySectionForConfig(
  markdown: string,
  opts?: BodySectionOptions,
): Promise<BodySectionResult> {
  if (needsAsyncDiagramCompile(opts?.diagrams)) {
    return renderBodySectionAsync(markdown, opts);
  }
  return renderBodySection(markdown, opts);
}