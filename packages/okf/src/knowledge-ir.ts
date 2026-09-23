/**
 * Knowledge IR — shared concepts and chunks for OKFC packing and search export.
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
  /** SHA-256 of `text` — stable chunk identifier. */
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

export interface KnowledgeIr {
  readonly concepts: readonly KnowledgeConceptEntry[];
  readonly chunks: readonly KnowledgeChunk[];
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
  return { concepts, chunks };
}
