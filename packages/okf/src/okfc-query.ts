/**
 * OKFC query — FTS (§6.1) and hybrid FTS+vec RRF (§6.2).
 * Vectors optional: missing vec_chunks → FTS-only.
 */

export const OKFC_RRF_K = 60;

export interface OkfcFtsHit {
  readonly id: string;
  readonly type: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly status: string;
  readonly score: number;
  /** Snippet from matching body when available. */
  readonly snippet?: string;
}

/** Chunk-level hit (hybrid or vec KNN). */
export interface OkfcChunkHit {
  readonly chunk_id: number;
  readonly concept_id: string;
  readonly type: string;
  readonly title: string | null;
  readonly status: string;
  readonly tags: string | null;
  readonly text: string;
  readonly heading_path: string;
  readonly heading_slug: string;
  readonly chunk_index: number;
  readonly score: number;
  readonly snippet?: string;
  readonly mode: "fts" | "vec" | "hybrid";
}

export interface QueryOkfcFtsOptions {
  readonly limit?: number;
  /** Exclude deprecated concepts (default true). */
  readonly excludeDeprecated?: boolean;
  /** Restrict to concept type(s). */
  readonly type?: string | readonly string[];
  /**
   * Restrict to tag slug (comma-separated `concepts.tags`).
   * Matches as a whole token: `,tag,` style.
   */
  readonly tag?: string;
}

export interface QueryOkfcHybridOptions extends QueryOkfcFtsOptions {
  /** RRF k (default 60). */
  readonly rrfK?: number;
  /** Candidate pool per channel (default max(k*5, 50)). */
  readonly pool?: number;
}

type BetterSqliteDatabase = {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  exec?(sql: string): unknown;
  loadExtension?(path: string): void;
  close(): void;
};

type BetterSqliteCtor = new (
  path: string,
  options?: { readonly readonly?: boolean },
) => BetterSqliteDatabase;

async function loadBetterSqlite3(): Promise<BetterSqliteCtor> {
  try {
    const mod = (await import("better-sqlite3")) as unknown as {
      default?: BetterSqliteCtor;
    } & BetterSqliteCtor;
    return (mod.default ?? mod) as BetterSqliteCtor;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `OKFC query requires better-sqlite3 (npm install better-sqlite3): ${msg}`,
    );
  }
}

async function tryLoadSqliteVec(db: BetterSqliteDatabase): Promise<boolean> {
  try {
    const mod = (await import("sqlite-vec")) as {
      load?: (db: BetterSqliteDatabase) => void;
      default?: { load?: (db: BetterSqliteDatabase) => void };
    };
    const load = mod.load ?? mod.default?.load;
    if (typeof load !== "function") return false;
    load(db);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escape a user query for FTS5 MATCH (string token style).
 * Keeps alphanumerics and CJK; wraps in double quotes for phrase-ish safety.
 */
export function prepareOkfcFtsQuery(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/["']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" ");
}

/** Reciprocal Rank Fusion over ranked id lists (same idea as @sorane/search). */
export function okfcRrfFuse(
  rankings: readonly (readonly number[])[],
  k: number = OKFC_RRF_K,
): Map<number, number> {
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank]!;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return scores;
}

function filterClauses(opts?: QueryOkfcFtsOptions): {
  typeClause: string;
  tagClause: string;
  statusClause: string;
  binds: unknown[];
} {
  const types = opts?.type
    ? Array.isArray(opts.type)
      ? [...opts.type]
      : [opts.type]
    : [];
  const binds: unknown[] = [];
  let typeClause = "";
  if (types.length > 0) {
    typeClause = ` AND c.type IN (${types.map(() => "?").join(",")})`;
    binds.push(...types);
  }
  let tagClause = "";
  const tag = opts?.tag?.trim();
  if (tag && tag.length > 0) {
    tagClause = ` AND (',' || COALESCE(c.tags,'') || ',') LIKE ?`;
    binds.push(`%,${tag},%`);
  }
  const excludeDeprecated = opts?.excludeDeprecated !== false;
  const statusClause = excludeDeprecated ? ` AND c.status != 'deprecated'` : "";
  return { typeClause, tagClause, statusClause, binds };
}

function tableExists(db: BetterSqliteDatabase, name: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS o FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    )
    .get(name) as { o: number } | undefined;
  return row != null;
}

/** True when OKFC has a non-empty vec_chunks table (sqlite-vec must already be loaded). */
export function okfcHasVecChunksOnDb(db: BetterSqliteDatabase): boolean {
  if (!tableExists(db, "vec_chunks")) return false;
  try {
    const n = (
      db.prepare("SELECT COUNT(*) AS c FROM vec_chunks").get() as { c: number }
    ).c;
    return n > 0;
  } catch {
    return false;
  }
}

/** Read okfc_meta key/value map. */
export function readOkfcMetaOnDb(db: BetterSqliteDatabase): Record<string, string> {
  if (!tableExists(db, "okfc_meta")) return {};
  const rows = db.prepare("SELECT key, value FROM okfc_meta").all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function readOkfcMeta(
  dbPath: string,
): Promise<Record<string, string>> {
  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true });
  try {
    return readOkfcMetaOnDb(db);
  } finally {
    db.close();
  }
}

export async function okfcHasVecChunks(dbPath: string): Promise<boolean> {
  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true });
  try {
    const loaded = await tryLoadSqliteVec(db);
    if (!loaded) return false;
    return okfcHasVecChunksOnDb(db);
  } finally {
    db.close();
  }
}

/**
 * Full-text search an OKFC file. Opens the DB read-only and closes it.
 * Does not require vec_chunks (FTS-only path).
 */
export async function queryOkfcFts(
  dbPath: string,
  query: string,
  opts?: QueryOkfcFtsOptions,
): Promise<readonly OkfcFtsHit[]> {
  const match = prepareOkfcFtsQuery(query);
  if (match.length === 0) return [];

  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true });
  try {
    return queryOkfcFtsOnDb(db, match, opts);
  } finally {
    db.close();
  }
}

/** Query using an already-open better-sqlite3 database (and prepared MATCH string). */
export function queryOkfcFtsOnDb(
  db: BetterSqliteDatabase,
  ftsMatch: string,
  opts?: QueryOkfcFtsOptions,
): readonly OkfcFtsHit[] {
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 100));
  const { typeClause, tagClause, statusClause, binds } = filterClauses(opts);
  const params: unknown[] = [ftsMatch, ...binds, limit];

  const sql = `
    SELECT
      c.id AS id,
      c.type AS type,
      c.title AS title,
      c.description AS description,
      c.status AS status,
      bm25(concepts_fts) AS score,
      snippet(concepts_fts, 0, '', '', '…', 32) AS snippet
    FROM concepts_fts
    JOIN concepts c ON concepts_fts.rowid = c.rowid
    WHERE concepts_fts MATCH ?
      ${statusClause}
      ${typeClause}
      ${tagClause}
    ORDER BY score
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params) as {
    id: string;
    type: string;
    title: string | null;
    description: string | null;
    status: string;
    score: number;
    snippet: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    score: r.score,
    snippet: r.snippet ?? undefined,
  }));
}

function makeSnippet(text: string, query: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const q = query.trim();
  let start = 0;
  if (q) {
    const idx = flat.toLowerCase().indexOf(q.toLowerCase());
    if (idx >= 0) start = Math.max(0, idx - Math.floor(max / 4));
  }
  const end = Math.min(flat.length, start + max);
  const body = flat.slice(start, end);
  return (start > 0 ? "…" : "") + body + (end < flat.length ? "…" : "");
}

type ChunkJoinRow = {
  chunk_id: number;
  concept_id: string;
  type: string;
  title: string | null;
  status: string;
  tags: string | null;
  text: string;
  heading_path: string;
  heading_slug: string;
  chunk_index: number;
  distance?: number;
};

/**
 * Vector KNN over chunks (vec_chunks.rowid = chunks.id).
 * Requires sqlite-vec loaded on `db`.
 */
export function queryOkfcVecKnnOnDb(
  db: BetterSqliteDatabase,
  queryVec: ArrayLike<number>,
  opts?: QueryOkfcFtsOptions & { readonly pool?: number },
): readonly OkfcChunkHit[] {
  if (!okfcHasVecChunksOnDb(db)) return [];
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 100));
  const pool = opts?.pool ?? Math.max(limit * 5, 50);
  const { typeClause, tagClause, statusClause, binds } = filterClauses(opts);
  const hasFilter = typeClause.length > 0 || tagClause.length > 0 || statusClause.length > 0;
  const knnLimit = hasFilter ? Math.max(pool * 4, 64) : pool;
  const f32 =
    queryVec instanceof Float32Array
      ? queryVec
      : new Float32Array(Array.from(queryVec as ArrayLike<number>));
  const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);

  // vec0: LIMIT must be in the same subquery as MATCH
  const sql = `
    SELECT
      ch.id AS chunk_id,
      ch.concept_id AS concept_id,
      c.type AS type,
      c.title AS title,
      c.status AS status,
      c.tags AS tags,
      ch.text AS text,
      COALESCE(ch.heading_path, '') AS heading_path,
      COALESCE(ch.heading_slug, '') AS heading_slug,
      ch.chunk_index AS chunk_index,
      k.distance AS distance
    FROM (
      SELECT rowid, distance FROM vec_chunks
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    ) k
    JOIN chunks ch ON ch.id = k.rowid
    JOIN concepts c ON c.id = ch.concept_id
    WHERE 1=1
      ${statusClause}
      ${typeClause}
      ${tagClause}
    ORDER BY k.distance
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(buf, knnLimit, ...binds, limit) as ChunkJoinRow[];
  return rows.map((r, rank) => ({
    chunk_id: Number(r.chunk_id),
    concept_id: r.concept_id,
    type: r.type,
    title: r.title,
    status: r.status,
    tags: r.tags,
    text: r.text,
    heading_path: r.heading_path,
    heading_slug: r.heading_slug,
    chunk_index: r.chunk_index,
    score: 1 / (rank + 1),
    mode: "vec" as const,
  }));
}

/**
 * Hybrid search: concept FTS expanded to chunks + vec KNN, fused with RRF (§6.2).
 * Requires sqlite-vec loaded when vectors exist; degrades to FTS concept→chunk expand.
 */
export function queryOkfcHybridOnDb(
  db: BetterSqliteDatabase,
  query: string,
  queryVec: ArrayLike<number> | null,
  opts?: QueryOkfcHybridOptions,
): readonly OkfcChunkHit[] {
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 100));
  const pool = opts?.pool ?? Math.max(limit * 5, 50);
  const rrfK = opts?.rrfK ?? OKFC_RRF_K;
  const ftsMatch = prepareOkfcFtsQuery(query);
  const { typeClause, tagClause, statusClause, binds } = filterClauses(opts);

  const byChunk = new Map<number, OkfcChunkHit>();

  // --- FTS channel: concept ranks → all chunks of those concepts ---
  const ftsChunkOrder: number[] = [];
  if (ftsMatch.length > 0) {
    const ftsSql = `
      SELECT
        c.id AS concept_id,
        bm25(concepts_fts) AS score
      FROM concepts_fts
      JOIN concepts c ON concepts_fts.rowid = c.rowid
      WHERE concepts_fts MATCH ?
        ${statusClause}
        ${typeClause}
        ${tagClause}
      ORDER BY score
      LIMIT ?
    `;
    const conceptHits = db.prepare(ftsSql).all(ftsMatch, ...binds, pool) as {
      concept_id: string;
      score: number;
    }[];
    const chunkSql = db.prepare(`
      SELECT
        ch.id AS chunk_id,
        ch.concept_id AS concept_id,
        c.type AS type,
        c.title AS title,
        c.status AS status,
        c.tags AS tags,
        ch.text AS text,
        COALESCE(ch.heading_path, '') AS heading_path,
        COALESCE(ch.heading_slug, '') AS heading_slug,
        ch.chunk_index AS chunk_index
      FROM chunks ch
      JOIN concepts c ON c.id = ch.concept_id
      WHERE ch.concept_id = ?
      ORDER BY ch.chunk_index
    `);
    for (const ch of conceptHits) {
      const chunks = chunkSql.all(ch.concept_id) as ChunkJoinRow[];
      for (const row of chunks) {
        const id = Number(row.chunk_id);
        if (!byChunk.has(id)) {
          byChunk.set(id, {
            chunk_id: id,
            concept_id: row.concept_id,
            type: row.type,
            title: row.title,
            status: row.status,
            tags: row.tags,
            text: row.text,
            heading_path: row.heading_path,
            heading_slug: row.heading_slug,
            chunk_index: row.chunk_index,
            score: 0,
            mode: "fts",
          });
        }
        ftsChunkOrder.push(id);
      }
    }
  }

  // --- Vector channel ---
  const vecChunkOrder: number[] = [];
  const useVec =
    queryVec != null &&
    (queryVec as ArrayLike<number>).length > 0 &&
    okfcHasVecChunksOnDb(db);
  if (useVec) {
    const vecHits = queryOkfcVecKnnOnDb(db, queryVec!, {
      ...opts,
      limit: pool,
      pool,
    });
    for (const h of vecHits) {
      byChunk.set(h.chunk_id, { ...h, mode: "hybrid" });
      vecChunkOrder.push(h.chunk_id);
    }
  }

  if (byChunk.size === 0) return [];

  // FTS-only hybrid degradation (no vectors)
  if (vecChunkOrder.length === 0) {
    return ftsChunkOrder
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, limit)
      .map((id, rank) => {
        const row = byChunk.get(id)!;
        return {
          ...row,
          score: 1 / (rank + 1),
          snippet: makeSnippet(row.text, query),
          mode: "fts" as const,
        };
      });
  }

  // If only vectors
  if (ftsChunkOrder.length === 0) {
    return vecChunkOrder.slice(0, limit).map((id, rank) => {
      const row = byChunk.get(id)!;
      return {
        ...row,
        score: 1 / (rank + 1),
        snippet: makeSnippet(row.text, query),
        mode: "vec" as const,
      };
    });
  }

  const fused = okfcRrfFuse([vecChunkOrder, ftsChunkOrder], rrfK);
  const ranked = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  return ranked.map(([id, score]) => {
    const row = byChunk.get(id)!;
    return {
      ...row,
      score,
      snippet: makeSnippet(row.text, query),
      mode: "hybrid" as const,
    };
  });
}

/**
 * Hybrid OKFC query: opens DB, loads sqlite-vec when needed, runs RRF.
 * Pass `queryVec` from the embedding model used at pack time (okfc_meta.model_*).
 * When queryVec is null/empty or vec_chunks absent → FTS-expanded chunk ranking.
 */
export async function queryOkfcHybrid(
  dbPath: string,
  query: string,
  queryVec: ArrayLike<number> | null,
  opts?: QueryOkfcHybridOptions,
): Promise<readonly OkfcChunkHit[]> {
  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true });
  try {
    if (queryVec != null && (queryVec as ArrayLike<number>).length > 0) {
      const loaded = await tryLoadSqliteVec(db);
      if (!loaded && opts?.limit !== 0) {
        // fall through to FTS-only hybrid path
      }
    }
    return queryOkfcHybridOnDb(db, query, queryVec, opts);
  } finally {
    db.close();
  }
}
