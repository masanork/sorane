import type { EmbeddingProvider } from "./embeddings.ts";
import { QUERY_PREFIX } from "./embeddings.ts";
import type { ChunkRow, FtsHit, IndexStore, MetaFilter, VecHit } from "./store.ts";

export const RRF_K = 60;

export function buildFtsQuery(query: string): string {
  const segs = query
    .split(/[぀-ゟ]+|[\s、。・，．:：;；!！?？()（）「」『』【】\[\]]+/)
    .map((s) => s.replace(/"/g, "").trim())
    .filter((s) => s.length >= 2);
  if (segs.length === 0) return query.replace(/"/g, " ").trim();
  return segs.map((s) => `"${s}"`).join(" OR ");
}

export function rrfFuse(rankings: number[][], k: number = RRF_K): Map<number, number> {
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank]!;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return scores;
}

export function makeSnippet(text: string, query: string, max: number = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const q = query.trim();
  let start = 0;
  if (q) {
    const idx = flat.indexOf(q);
    if (idx >= 0) start = Math.max(0, idx - Math.floor(max / 4));
  }
  const end = Math.min(flat.length, start + max);
  const body = flat.slice(start, end);
  return (start > 0 ? "…" : "") + body + (end < flat.length ? "…" : "");
}

export function checkModelMismatch(
  meta: Record<string, string>,
  modelId: string,
  dim: number,
): string | null {
  const issues: string[] = [];
  if (meta.dim && Number(meta.dim) !== dim) {
    issues.push(`dim index=${meta.dim} runtime=${dim}`);
  }
  if (meta.model_id && meta.model_id !== modelId) {
    issues.push(`model index=${meta.model_id} runtime=${modelId}`);
  }
  return issues.length ? issues.join(", ") : null;
}

export interface SearchOptions {
  readonly k?: number;
  readonly filter?: MetaFilter;
  readonly ftsOnly?: boolean;
}

export interface SearchResult extends ChunkRow {
  readonly score: number;
  readonly snippet: string;
}

export function searchFts(
  store: IndexStore,
  query: string,
  opts: SearchOptions = {},
): SearchResult[] {
  const k = opts.k ?? 10;
  const filter = opts.filter ?? {};
  let hits: FtsHit[] = [];
  try {
    hits = store.ftsSearch(buildFtsQuery(query), k, filter);
  } catch {
    hits = [];
  }
  return hits.map((row, rank) => ({
    ...row,
    score: 1 / (rank + 1),
    snippet: makeSnippet(row.text, query),
  }));
}

export async function searchHybrid(
  store: IndexStore,
  embeddings: EmbeddingProvider,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const k = opts.k ?? 10;
  const filter = opts.filter ?? {};
  const pool = Math.max(k * 5, 50);

  const queryVec = await embeddings.embed(QUERY_PREFIX + query);
  const vecHits: VecHit[] = store.vecKnn(queryVec, pool, filter);
  let ftsHits: FtsHit[] = [];
  try {
    ftsHits = store.ftsSearch(buildFtsQuery(query), pool, filter);
  } catch {
    ftsHits = [];
  }

  const byId = new Map<number, ChunkRow>();
  for (const h of vecHits) byId.set(h.id, h);
  for (const h of ftsHits) byId.set(h.id, h);

  const fused = rrfFuse([vecHits.map((h) => h.id), ftsHits.map((h) => h.id)]);
  const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);

  return ranked.flatMap(([id, score]) => {
    const row = byId.get(id);
    if (!row) return [];
    return [{ ...row, score, snippet: makeSnippet(row.text, query) }];
  });
}

export async function search(
  store: IndexStore,
  embeddings: EmbeddingProvider | null,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const useHybrid = !opts.ftsOnly && embeddings !== null && store.hasVectors();
  if (useHybrid && embeddings) {
    return searchHybrid(store, embeddings, query, opts);
  }
  return searchFts(store, query, opts);
}