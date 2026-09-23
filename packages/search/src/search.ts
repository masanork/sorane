import type { ChunkRow, FtsHit, IndexStore, MetaFilter } from "./store.ts";

export function buildFtsQuery(query: string): string {
  const segs = query
    .split(/[぀-ゟ]+|[\s、。・，．:：;；!！?？()（）「」『』【】\[\]]+/)
    .map((s) => s.replace(/"/g, "").trim())
    .filter((s) => s.length >= 2);
  if (segs.length === 0) return query.replace(/"/g, " ").trim();
  return segs.map((s) => `"${s}"`).join(" OR ");
}

export function makeSnippet(text: string, query: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const idx = query.trim() ? flat.indexOf(query.trim()) : -1;
  const start = idx >= 0 ? Math.max(0, idx - Math.floor(max / 4)) : 0;
  const end = Math.min(flat.length, start + max);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
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
  let hits: FtsHit[] = [];
  try {
    hits = store.ftsSearch(buildFtsQuery(query), k, opts.filter ?? {});
  } catch {
    return [];
  }
  return hits.map((row, rank) => ({
    ...row,
    score: 1 / (rank + 1),
    snippet: makeSnippet(row.text, query),
  }));
}

export function search(
  store: IndexStore,
  query: string,
  opts: SearchOptions = {},
): SearchResult[] {
  return searchFts(store, query, opts);
}
