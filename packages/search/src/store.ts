import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Chunk } from "./chunker.ts";

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE chunks (
  id           INTEGER PRIMARY KEY,
  source       TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  text         TEXT NOT NULL,
  heading_path TEXT,
  heading_slug TEXT,
  doc_type     TEXT,
  title        TEXT,
  timestamp    TEXT,
  tags         TEXT
);
CREATE INDEX idx_chunks_source ON chunks(source);
CREATE INDEX idx_chunks_type   ON chunks(doc_type);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  content='chunks',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TABLE index_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

export interface ChunkRow {
  readonly id: number;
  readonly source: string;
  readonly chunkIndex: number;
  readonly text: string;
  readonly headingPath: string;
  readonly headingSlug: string;
  readonly docType: string;
  readonly title: string;
  readonly timestamp: string;
  readonly tags: string;
}

export interface MetaFilter {
  readonly docType?: string;
  readonly tag?: string;
}

export interface FtsHit extends ChunkRow {
  readonly bm25: number;
}

export interface Counts {
  readonly chunks: number;
  readonly fts: number;
}

const CHUNK_COLS = `c.id, c.source, c.chunk_index AS chunkIndex, c.text,
  c.heading_path AS headingPath, c.heading_slug AS headingSlug,
  c.doc_type AS docType, c.title, c.timestamp, c.tags`;

function buildWhere(filter: MetaFilter): { clause: string; binds: string[] } {
  const conds: string[] = [];
  const binds: string[] = [];
  if (filter.docType) {
    conds.push("c.doc_type = ?");
    binds.push(filter.docType);
  }
  if (filter.tag) {
    conds.push("(',' || c.tags || ',') LIKE ?");
    binds.push(`%,${filter.tag},%`);
  }
  return { clause: conds.length ? conds.join(" AND ") : "", binds };
}

export class IndexStore {
  private readonly db: Database.Database;

  constructor(dbPath: string, opts: { fresh?: boolean } = {}) {
    mkdirSync(dirname(dbPath), { recursive: true });
    if (opts.fresh && existsSync(dbPath)) rmSync(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    if (!this.tableExists("chunks")) {
      this.db.exec(SCHEMA);
    }
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS source_meta (source TEXT PRIMARY KEY, sha256 TEXT NOT NULL)",
    );
  }

  private tableExists(name: string): boolean {
    return (
      this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
        .get(name) != null
    );
  }

  clear(): void {
    this.db.exec("DELETE FROM chunks; DELETE FROM source_meta;");
  }

  deleteBySource(source: string): void {
    const delChunk = this.db.prepare("DELETE FROM chunks WHERE source = ?");
    const delMeta = this.db.prepare("DELETE FROM source_meta WHERE source = ?");
    const tx = this.db.transaction(() => {
      delChunk.run(source);
      delMeta.run(source);
    });
    tx();
  }

  sourceHashes(): Map<string, string> {
    const rows = this.db.prepare("SELECT source, sha256 FROM source_meta").all() as {
      source: string;
      sha256: string;
    }[];
    return new Map(rows.map((r) => [r.source, r.sha256]));
  }

  setSourceHash(source: string, sha256: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO source_meta(source, sha256) VALUES (?, ?)")
      .run(source, sha256);
  }

  addChunks(chunks: Chunk[]): void {
    const insChunk = this.db.prepare(
      `INSERT INTO chunks
        (source, chunk_index, text, heading_path, heading_slug, doc_type, title, timestamp, tags)
       VALUES (@source, @chunkIndex, @text, @headingPath, @headingSlug, @docType, @title, @timestamp, @tags)`,
    );
    const tx = this.db.transaction(() => {
      for (const chunk of chunks) {
        insChunk.run(chunk as unknown as Record<string, unknown>);
      }
    });
    tx();
  }

  setMeta(): void {
    const ins = this.db.prepare(
      "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?, ?)",
    );
    const tx = this.db.transaction(() => {
      ins.run("schema_version", String(SCHEMA_VERSION));
      ins.run("mode", "fts-only");
      ins.run("built_at", new Date().toISOString());
    });
    tx();
  }

  counts(): Counts {
    const n = (sql: string) => (this.db.prepare(sql).get() as { c: number }).c;
    return {
      chunks: n("SELECT COUNT(*) c FROM chunks"),
      fts: n("SELECT COUNT(*) c FROM chunks_fts"),
    };
  }

  ftsSearch(query: string, k: number, filter: MetaFilter = {}): FtsHit[] {
    const { clause, binds } = buildWhere(filter);
    const sql = `
      SELECT ${CHUNK_COLS}, bm25(chunks_fts) AS bm25
      FROM chunks_fts
      JOIN chunks c ON c.id = chunks_fts.rowid
      WHERE chunks_fts MATCH ?${clause ? ` AND ${clause}` : ""}
      ORDER BY bm25
      LIMIT ?`;
    return this.db.prepare(sql).all(query, ...binds, k) as FtsHit[];
  }

  close(): void {
    this.db.close();
  }
}