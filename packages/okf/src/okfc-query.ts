/** Read-only full-text search for OKFC files. */

export interface OkfcFtsHit {
  readonly id: string;
  readonly type: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly status: string;
  readonly score: number;
  readonly snippet?: string;
}

export interface QueryOkfcFtsOptions {
  readonly limit?: number;
  readonly excludeDeprecated?: boolean;
  readonly type?: string | readonly string[];
  readonly tag?: string;
}

type BetterSqliteDatabase = {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  close(): void;
};
type BetterSqliteCtor = new (path: string, options?: { readonly readonly?: boolean }) => BetterSqliteDatabase;

async function loadBetterSqlite3(): Promise<BetterSqliteCtor> {
  try {
    const mod = (await import("better-sqlite3")) as unknown as {
      default?: BetterSqliteCtor;
    } & BetterSqliteCtor;
    return (mod.default ?? mod) as BetterSqliteCtor;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`OKFC query requires better-sqlite3 (npm install better-sqlite3): ${msg}`);
  }
}

export function prepareOkfcFtsQuery(raw: string): string {
  const cleaned = raw.trim().replace(/["']/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.split(" ").filter(Boolean).map((token) => `"${token}"`).join(" ") : "";
}

function filterClauses(opts?: QueryOkfcFtsOptions): {
  typeClause: string;
  tagClause: string;
  statusClause: string;
  binds: unknown[];
} {
  const types = opts?.type
    ? Array.isArray(opts.type) ? [...opts.type] : [opts.type]
    : [];
  const binds: unknown[] = [];
  const typeClause = types.length ? ` AND c.type IN (${types.map(() => "?").join(",")})` : "";
  binds.push(...types);
  const tag = opts?.tag?.trim();
  const tagClause = tag ? ` AND (',' || COALESCE(c.tags,'') || ',') LIKE ?` : "";
  if (tag) binds.push(`%,${tag},%`);
  const statusClause = opts?.excludeDeprecated === false ? "" : ` AND c.status != 'deprecated'`;
  return { typeClause, tagClause, statusClause, binds };
}

export async function queryOkfcFts(
  dbPath: string,
  query: string,
  opts?: QueryOkfcFtsOptions,
): Promise<readonly OkfcFtsHit[]> {
  const match = prepareOkfcFtsQuery(query);
  if (!match) return [];
  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true });
  try {
    return queryOkfcFtsOnDb(db, match, opts);
  } finally {
    db.close();
  }
}

export function queryOkfcFtsOnDb(
  db: BetterSqliteDatabase,
  ftsMatch: string,
  opts?: QueryOkfcFtsOptions,
): readonly OkfcFtsHit[] {
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 100));
  const { typeClause, tagClause, statusClause, binds } = filterClauses(opts);
  const sql = `
    SELECT c.id AS id, c.type AS type, c.title AS title,
      c.description AS description, c.status AS status,
      bm25(concepts_fts) AS score,
      snippet(concepts_fts, 0, '', '', '…', 32) AS snippet
    FROM concepts_fts
    JOIN concepts c ON concepts_fts.rowid = c.rowid
    WHERE concepts_fts MATCH ? ${statusClause} ${typeClause} ${tagClause}
    ORDER BY score LIMIT ?`;
  const rows = db.prepare(sql).all(ftsMatch, ...binds, limit) as {
    id: string; type: string; title: string | null; description: string | null;
    status: string; score: number; snippet: string | null;
  }[];
  return rows.map((row) => ({ ...row, snippet: row.snippet ?? undefined }));
}
