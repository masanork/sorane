import type { ChunkRow, FtsHit, IndexStore, MetaFilter } from "./store.ts";

/**
 * FTS5(trigram) 用クエリ。助詞混じり自然文をセグメント OR に分解する。
 */
export function buildFtsQuery(query: string): string {
  const segs = query
    .split(/[぀-ゟ]+|[\s、。・，．:：;；!！?？()（）「」『』【】\[\]]+/)
    .map((s) => s.replace(/"/g, "").trim())
    .filter((s) => s.length >= 2);
  if (segs.length === 0) return query.replace(/"/g, " ").trim();
  return segs.map((s) => `"${s}"`).join(" OR ");
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

export interface SearchOptions {
  readonly k?: number;
  readonly filter?: MetaFilter;
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