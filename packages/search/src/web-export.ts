import { Buffer } from "node:buffer";
import type { ChunkRow } from "./store.ts";

export const WEB_INDEX_SCHEMA_VERSION = 3;
export const FTS_WEB_INDEX_SCHEMA_VERSION = 4;
export const INT8_SCALE = 127;
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
}

export interface WebIndex {
  readonly schema_version: number;
  readonly mode: "hybrid";
  readonly built_at: string;
  readonly model: { id: string; dim: number; quant: string; sha256: string };
  readonly chunks: WebChunk[];
  readonly embeddings: {
    readonly dim: number;
    readonly encoding: "int8";
    readonly scale: number;
    readonly vectors_b64: string;
  };
}

export interface FtsWebChunk extends WebChunk {
  readonly text: string;
}

export interface FtsWebIndex {
  readonly schema_version: number;
  readonly mode: "fts";
  readonly built_at: string;
  readonly chunks: FtsWebChunk[];
}

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

export function buildWebIndex(
  rows: ChunkRow[],
  vectors: number[][],
  meta: Record<string, string>,
  sourceToUrl: (source: string) => string = defaultSourceUrl,
  opts?: {
    readonly disclosureMap?: ReadonlyMap<string, string>;
    readonly machineReadable?: boolean;
  },
): WebIndex {
  const machineReadable = opts?.machineReadable !== false;
  const dim = Number(meta.dim) || (vectors[0]?.length ?? 0);
  if (rows.length !== vectors.length) {
    throw new Error(`row/vector count mismatch: ${rows.length} != ${vectors.length}`);
  }

  const kept: { row: ChunkRow; vec: number[] }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const vec = vectors[i]!;
    if (vec.length === 0) continue;
    kept.push({ row: rows[i]!, vec });
  }

  const buf = new Int8Array(kept.length * dim);
  for (let i = 0; i < kept.length; i++) {
    const v = kept[i]!.vec;
    if (v.length !== dim) throw new Error(`dimension mismatch chunk[${i}]: ${v.length} != ${dim}`);
    for (let j = 0; j < dim; j++) {
      const q = Math.round(v[j]! * INT8_SCALE);
      buf[i * dim + j] = q < -127 ? -127 : q > 127 ? 127 : q;
    }
  }
  const vectors_b64 = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString("base64");

  const chunks: WebChunk[] = kept.map(({ row: r }) => {
    const chunk: WebChunk = {
      source: r.source,
      url: sourceToUrl(r.source),
      heading_slug: r.headingSlug,
      heading_path: r.headingPath,
      doc_type: r.docType,
      title: r.title,
      tags: r.tags,
      snippet: toSnippet(r.text),
    };
    const dst = disclosureForSource(r.source, opts?.disclosureMap, machineReadable);
    if (dst) return { ...chunk, digital_source_type: dst };
    return chunk;
  });

  return {
    schema_version: WEB_INDEX_SCHEMA_VERSION,
    mode: "hybrid",
    built_at: new Date().toISOString(),
    model: {
      id: meta.model_id ?? "",
      dim,
      quant: meta.quant ?? "",
      sha256: meta.model_sha256 ?? "",
    },
    chunks,
    embeddings: { dim, encoding: "int8", scale: INT8_SCALE, vectors_b64 },
  };
}

export function buildFtsWebIndex(
  rows: ChunkRow[],
  sourceToUrl: (source: string) => string = defaultSourceUrl,
  opts?: {
    readonly disclosureMap?: ReadonlyMap<string, string>;
    readonly machineReadable?: boolean;
  },
): FtsWebIndex {
  const machineReadable = opts?.machineReadable !== false;
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
      text: r.text,
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