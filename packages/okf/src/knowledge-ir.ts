/**
 * Knowledge IR — single intermediate representation for OKFC pack and search export.
 * Embeddings attach once by `text_hash` (U3); pack and search both read them.
 */

import type { OkfConcept } from "./normalize.ts";
import { hashChunkText } from "./chunk-prose.ts";
import {
  buildOkfcConceptRow,
  hashOkfcSource,
  type OkfcPackConcept,
} from "./okfc.ts";
import { conceptToOkfMarkdown } from "./serialize.ts";

export interface KnowledgeChunk {
  readonly concept_id: string;
  readonly chunk_index: number;
  readonly text: string;
  readonly heading_path: string;
  readonly heading_slug: string;
  readonly chunk_format: "text" | "field" | "operation" | "message" | "entry";
  /** SHA-256 of `text` — embed/cache key. */
  readonly text_hash: string;
}

export interface KnowledgeConceptEntry {
  readonly id: string;
  readonly slug: string;
  /** Content-relative path when known (search incremental key). */
  readonly source_path?: string;
  readonly concept: OkfConcept;
  readonly source_hash: string;
  /** Precomputed OKFC row fields (sources/verified/frontmatter JSON). */
  readonly pack: {
    readonly type: string;
    readonly title: string | null;
    readonly description: string | null;
    readonly resource: string | null;
    readonly tags: string | null;
    readonly status: string;
    readonly stale_after: string | null;
    readonly generated_by: string | null;
    readonly generated_at: string | null;
    readonly frontmatter: string;
    readonly body: string;
    readonly body_format: string;
    readonly sources: readonly {
      readonly source_id: string | null;
      readonly resource: string;
      readonly title: string | null;
      readonly author: string | null;
      readonly usage_count: number | null;
      readonly last_modified: string | null;
    }[];
    readonly verified: readonly {
      readonly verified_by: string;
      readonly verified_at: string;
    }[];
  };
}

export interface KnowledgeEmbedding {
  readonly text_hash: string;
  readonly vector: Float32Array | number[];
}

export interface KnowledgeIr {
  readonly concepts: readonly KnowledgeConceptEntry[];
  readonly chunks: readonly KnowledgeChunk[];
  /** Present only after embed pass (U3). */
  readonly embeddings?: readonly KnowledgeEmbedding[];
  readonly model?: {
    readonly model_id: string;
    readonly dim: number;
    readonly quant?: string;
    readonly model_sha256?: string;
  };
}

export interface BuildKnowledgeIrOptions {
  /**
   * Map concept id → content-relative path for search source keys.
   * Optional; used when projecting to search-index.
   */
  readonly sourcePathByConceptId?: ReadonlyMap<string, string>;
}

export function conceptIdFor(type: string, slug: string): string {
  return `${type}/${slug}`;
}

/** Build IR from the same pack inputs used for OKFC (canonical chunk path). */
export function buildKnowledgeIr(
  packConcepts: readonly OkfcPackConcept[],
  opts?: BuildKnowledgeIrOptions,
): KnowledgeIr {
  const concepts: KnowledgeConceptEntry[] = [];
  const chunks: KnowledgeChunk[] = [];
  const pathMap = opts?.sourcePathByConceptId;

  for (const input of packConcepts) {
    const row = buildOkfcConceptRow(input);
    const markdown = conceptToOkfMarkdown(input.concept);
    concepts.push({
      id: row.id,
      slug: input.slug,
      source_path: pathMap?.get(row.id),
      concept: input.concept,
      source_hash: hashOkfcSource(markdown),
      pack: {
        type: row.type,
        title: row.title,
        description: row.description,
        resource: row.resource,
        tags: row.tags,
        status: row.status,
        stale_after: row.stale_after,
        generated_by: row.generated_by,
        generated_at: row.generated_at,
        frontmatter: row.frontmatter,
        body: row.body,
        body_format: row.body_format,
        sources: row.sources,
        verified: row.verified,
      },
    });
    row.chunks.forEach((c, i) => {
      chunks.push({
        concept_id: row.id,
        chunk_index: i,
        text: c.text,
        heading_path: c.heading_path,
        heading_slug: c.heading_slug,
        chunk_format: c.chunk_format,
        text_hash: hashChunkText(c.text),
      });
    });
  }

  concepts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  chunks.sort((a, b) => {
    const c = a.concept_id.localeCompare(b.concept_id);
    return c !== 0 ? c : a.chunk_index - b.chunk_index;
  });

  return { concepts, chunks };
}

/** Subset IR to selected concept ids (for unit packs). */
export function sliceKnowledgeIr(
  ir: KnowledgeIr,
  conceptIds: ReadonlySet<string>,
): KnowledgeIr {
  const concepts = ir.concepts.filter((c) => conceptIds.has(c.id));
  const idSet = new Set(concepts.map((c) => c.id));
  const chunks = ir.chunks.filter((c) => idSet.has(c.concept_id));
  let embeddings = ir.embeddings;
  if (embeddings && embeddings.length > 0) {
    const hashes = new Set(chunks.map((c) => c.text_hash));
    embeddings = embeddings.filter((e) => hashes.has(e.text_hash));
  }
  return {
    concepts,
    chunks,
    embeddings,
    model: embeddings && embeddings.length > 0 ? ir.model : undefined,
  };
}

/**
 * Attach embedding vectors keyed by `text_hash` (U3).
 * Does not re-chunk; pure join for pack / search projection.
 */
export function attachKnowledgeEmbeddings(
  ir: KnowledgeIr,
  embeddings: readonly KnowledgeEmbedding[],
  model: NonNullable<KnowledgeIr["model"]>,
): KnowledgeIr {
  const byHash = new Map<string, KnowledgeEmbedding>();
  for (const e of embeddings) {
    byHash.set(e.text_hash, e);
  }
  // Keep only hashes present in this IR (dedupe).
  const needed = new Set(ir.chunks.map((c) => c.text_hash));
  const filtered = [...needed]
    .map((h) => byHash.get(h))
    .filter((e): e is KnowledgeEmbedding => e != null);
  return {
    concepts: ir.concepts,
    chunks: ir.chunks,
    embeddings: filtered,
    model,
  };
}

/** Unique chunk texts in IR order (stable embed input order). */
export function uniqueChunkTextsForEmbed(ir: KnowledgeIr): {
  readonly text_hash: string;
  readonly text: string;
}[] {
  const seen = new Set<string>();
  const out: { text_hash: string; text: string }[] = [];
  for (const c of ir.chunks) {
    if (seen.has(c.text_hash)) continue;
    seen.add(c.text_hash);
    out.push({ text_hash: c.text_hash, text: c.text });
  }
  return out;
}
