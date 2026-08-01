/**
 * Unified knowledge index policy (embeddings into IR once → OKFC + search).
 * See design/knowledge-index-unified.md.
 */

export type KnowledgeEmbeddingsMode = "off" | "auto" | "on";

export interface KnowledgeBuildConfig {
  /**
   * Embed into Knowledge IR (0 or 1 times).
   * - off: FTS only (no vec_chunks)
   * - auto (default): when `search.mode: hybrid` and model present, embed once into IR
   *   for OKFC vec_chunks; otherwise FTS only
   * - on: model required or build/pack fails
   */
  readonly embeddings?: KnowledgeEmbeddingsMode;
}

export interface ResolvedKnowledgeBuildConfig {
  readonly embeddings: KnowledgeEmbeddingsMode;
}

export function resolveKnowledgeBuildConfig(
  raw: KnowledgeBuildConfig | undefined,
): ResolvedKnowledgeBuildConfig {
  const emb = raw?.embeddings;
  if (emb === "off" || emb === "auto" || emb === "on") {
    return { embeddings: emb };
  }
  return { embeddings: "auto" };
}
