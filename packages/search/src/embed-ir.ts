/**
 * Embed Knowledge IR once by text_hash (U3).
 * Same vectors feed OKFC vec_chunks and search IndexStore / web index.
 */

import {
  attachKnowledgeEmbeddings,
  uniqueChunkTextsForEmbed,
  type KnowledgeEmbedding,
  type KnowledgeIr,
} from "@sorane/okf";
import type { EmbeddingProvider } from "./embeddings.ts";
import { DOC_PREFIX } from "./embeddings.ts";

export interface EmbedKnowledgeIrOptions {
  /** Prefix for document embedding (default: Ruri DOC_PREFIX). */
  readonly docPrefix?: string;
  readonly onProgress?: (message: string) => void;
}

/**
 * Embed all unique chunk texts in `ir` and return IR with `embeddings` + `model`.
 * Reuses existing vectors for hashes already present on the IR.
 */
export async function embedKnowledgeIr(
  ir: KnowledgeIr,
  provider: EmbeddingProvider,
  opts: EmbedKnowledgeIrOptions = {},
): Promise<KnowledgeIr> {
  const prefix = opts.docPrefix ?? DOC_PREFIX;
  const log = opts.onProgress ?? (() => {});
  const existing = new Map<string, KnowledgeEmbedding>();
  for (const e of ir.embeddings ?? []) {
    existing.set(e.text_hash, e);
  }

  const unique = uniqueChunkTextsForEmbed(ir);
  const missing = unique.filter((u) => !existing.has(u.text_hash));
  log(
    `embed IR: ${unique.length} unique chunk(s), ${missing.length} new, ${unique.length - missing.length} cached`,
  );

  if (missing.length > 0) {
    const vectors = await provider.embedBatch(
      missing.map((m) => prefix + m.text),
    );
    if (vectors.length !== missing.length) {
      throw new Error(
        `embedKnowledgeIr: expected ${missing.length} vectors, got ${vectors.length}`,
      );
    }
    for (let i = 0; i < missing.length; i++) {
      const m = missing[i]!;
      const v = vectors[i]!;
      if (v.length !== provider.dimensions) {
        throw new Error(
          `embedKnowledgeIr: dim mismatch ${v.length} != ${provider.dimensions}`,
        );
      }
      existing.set(m.text_hash, { text_hash: m.text_hash, vector: v });
    }
  }

  const embeddings = unique.map((u) => existing.get(u.text_hash)!);
  return attachKnowledgeEmbeddings(ir, embeddings, {
    model_id: provider.modelId ?? "unknown",
    dim: provider.dimensions,
    quant: provider.quant,
    model_sha256: provider.modelSha256,
  });
}

/** Map search Chunk list order → vectors from IR (by matching text). */
export function vectorsAlignedToChunks(
  ir: KnowledgeIr,
  chunkTexts: readonly string[],
): number[][] | undefined {
  if (!ir.embeddings || ir.embeddings.length === 0) return undefined;
  const byHash = new Map(
    ir.embeddings.map((e) => [e.text_hash, e.vector] as const),
  );
  // Prefer hash via recomputing would need hashChunkText — match by building text→vector from IR chunks
  const textToHash = new Map(ir.chunks.map((c) => [c.text, c.text_hash]));
  const out: number[][] = [];
  for (const text of chunkTexts) {
    const hash = textToHash.get(text);
    if (!hash) return undefined;
    const vec = byHash.get(hash);
    if (!vec) return undefined;
    out.push(Array.from(vec));
  }
  return out;
}
