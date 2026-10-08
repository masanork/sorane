import type { ChunkRow } from "./store.ts";

export const FTS_WEB_INDEX_SCHEMA_VERSION = 4;
export const SNIPPET_LEN = 220;

export interface WebChunk {
  readonly source: string;
  readonly url: string;
  readonly heading_slug: string;
  readonly heading_path: string;
  readonly doc_type: string;
  readonly title: string;
  readonly tags: string;
  readonly snippet: string;
  readonly digital_source_type?: string;
  readonly lang?: string;
  readonly updated?: string;
}

export interface FtsWebChunk extends WebChunk {
  readonly text?: string;
}

export interface FtsWebIndex {
  readonly schema_version: number;
  readonly mode: "fts";
  readonly built_at: string;
  readonly chunks: FtsWebChunk[];
}

export type WebExportChunk = Pick<
  ChunkRow,
  | "source"
  | "chunkIndex"
  | "text"
  | "headingPath"
  | "headingSlug"
  | "docType"
  | "title"
  | "timestamp"
  | "tags"
>;

export function toSnippet(text: string, max: number = SNIPPET_LEN): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max) + "…";
}

export function defaultSourceUrl(source: string): string {
  return source.replace(/\.md$/i, ".html");
}

function disclosureForSource(
  source: string,
  disclosureMap: ReadonlyMap<string, string> | undefined,
  machineReadable: boolean,
): string | undefined {
  if (!machineReadable || !disclosureMap) return undefined;
  return disclosureMap.get(source);
}

export function buildFtsWebIndex(
  rows: readonly WebExportChunk[],
  sourceToUrl: (source: string) => string = defaultSourceUrl,
  opts?: {
    readonly disclosureMap?: ReadonlyMap<string, string>;
    readonly machineReadable?: boolean;
    readonly snippetOnly?: boolean;
    readonly metadataBySource?: ReadonlyMap<string, { lang: string; updated?: string }>;
  },
): FtsWebIndex {
  const machineReadable = opts?.machineReadable !== false;
  const snippetOnly = opts?.snippetOnly === true;
  const chunks: FtsWebChunk[] = rows.map((r) => {
    const chunk: FtsWebChunk = {
      source: r.source,
      url: sourceToUrl(r.source),
      heading_slug: r.headingSlug,
      heading_path: r.headingPath,
      doc_type: r.docType,
      title: r.title,
      tags: r.tags,
      snippet: toSnippet(r.text),
      ...(snippetOnly ? {} : { text: r.text }),
      ...opts?.metadataBySource?.get(r.source),
    };
    const dst = disclosureForSource(r.source, opts?.disclosureMap, machineReadable);
    if (dst) return { ...chunk, digital_source_type: dst };
    return chunk;
  });
  return {
    schema_version: FTS_WEB_INDEX_SCHEMA_VERSION,
    mode: "fts",
    built_at: new Date().toISOString(),
    chunks,
  };
}
