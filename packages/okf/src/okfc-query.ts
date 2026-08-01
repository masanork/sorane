/**
 * OKFC FTS query (Definition Profile, §6.1-style).
 * Vectors (vec_chunks) are optional and not required here.
 */

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

type BetterSqliteDatabase = {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
  };
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
  // FTS5: quote each token so operators are not interpreted
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" ");
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
  const excludeDeprecated = opts?.excludeDeprecated !== false;
  const types = opts?.type
    ? Array.isArray(opts.type)
      ? [...opts.type]
      : [opts.type]
    : [];

  const params: unknown[] = [ftsMatch];
  let typeClause = "";
  if (types.length > 0) {
    typeClause = ` AND c.type IN (${types.map(() => "?").join(",")})`;
    params.push(...types);
  }
  let tagClause = "";
  const tag = opts?.tag?.trim();
  if (tag && tag.length > 0) {
    // concepts.tags is comma-separated slugs
    tagClause = ` AND (',' || COALESCE(c.tags,'') || ',') LIKE ?`;
    params.push(`%,${tag},%`);
  }
  const statusClause = excludeDeprecated ? ` AND c.status != 'deprecated'` : "";
  params.push(limit);

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
