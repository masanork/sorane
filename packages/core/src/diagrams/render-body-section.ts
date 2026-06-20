import type { TocEntry, RenderOptions } from "../render.ts";
import { renderMarkdownDocument } from "../render.ts";
import type { DiagramRenderMeta } from "./diagram-meta.ts";
import { emptyDiagramMeta } from "./diagram-meta.ts";
import { isD2CompileEnabled } from "./compile-d2.ts";
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

/** `d2.enabled` なら非同期（D2 コンパイル）、それ以外は同期。 */
export async function renderBodySectionForConfig(
  markdown: string,
  opts?: BodySectionOptions,
): Promise<BodySectionResult> {
  if (isD2CompileEnabled(opts?.diagrams)) {
    return renderBodySectionAsync(markdown, opts);
  }
  return renderBodySection(markdown, opts);
}