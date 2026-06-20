import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Chunk } from "./chunker.ts";

export const SCHEMA_VERSION = 2;

export interface IndexMeta {
  readonly modelId: string;
  readonly dim: number;
  readonly quant: string;
  readonly modelSha256: string;
}

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

export interface VecHit extends ChunkRow {
  readonly distance: number;
}

export interface FtsHit extends ChunkRow {
  readonly bm25: number;
}

export interface Counts {
  readonly chunks: number;
  readonly fts: number;
  readonly vec: number;
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

  constructor(dbPath: string, opts: { fresh?: boolean; dim?: number } = {}) {
    mkdirSync(dirname(dbPath), { recursive: true });
    if (opts.fresh && existsSync(dbPath)) rmSync(dbPath);
    this.db = new Database(dbPath);
    sqliteVec.load(this.db);
    this.db.pragma("journal_mode = WAL");
    if (!this.tableExists("chunks")) {
      this.db.exec(SCHEMA);
      const dim = opts.dim ?? 256;
      this.db.exec(`CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding FLOAT[${dim}])`);
    } else {
      this.ensureVecTable(opts.dim ?? 256);
    }
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS source_meta (source TEXT PRIMARY KEY, sha256 TEXT NOT NULL)",
    );
  }

  private ensureVecTable(dim: number): void {
    if (!this.tableExists("vec_chunks")) {
      this.db.exec(`CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding FLOAT[${dim}])`);
    }
  }

  private tableExists(name: string): boolean {
    return (
      this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
        .get(name) != null
    );
  }

  hasVectors(): boolean {
    if (!this.tableExists("vec_chunks")) return false;
    const n = (this.db.prepare("SELECT COUNT(*) c FROM vec_chunks").get() as { c: number }).c;
    return n > 0;
  }

  clear(): void {
    this.db.exec("DELETE FROM chunks; DELETE FROM source_meta;");
    if (this.tableExists("vec_chunks")) {
      this.db.exec("DELETE FROM vec_chunks;");
    }
  }

  deleteBySource(source: string): void {
    const ids = this.db.prepare("SELECT id FROM chunks WHERE source = ?").all(source) as {
      id: number;
    }[];
    const delVec = this.tableExists("vec_chunks")
      ? this.db.prepare("DELETE FROM vec_chunks WHERE rowid = ?")
      : null;
    const delChunk = this.db.prepare("DELETE FROM chunks WHERE source = ?");
    const delMeta = this.db.prepare("DELETE FROM source_meta WHERE source = ?");
    const tx = this.db.transaction(() => {
      for (const { id } of ids) {
        if (delVec) delVec.run(BigInt(id));
      }
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

  addChunks(chunks: Chunk[], vectors?: number[][]): void {
    const insChunk = this.db.prepare(
      `INSERT INTO chunks
        (source, chunk_index, text, heading_path, heading_slug, doc_type, title, timestamp, tags)
       VALUES (@source, @chunkIndex, @text, @headingPath, @headingSlug, @docType, @title, @timestamp, @tags)`,
    );
    const insVec = this.tableExists("vec_chunks")
      ? this.db.prepare("INSERT INTO vec_chunks(rowid, embedding) VALUES (?, ?)")
      : null;
    const tx = this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const info = insChunk.run(chunks[i]! as unknown as Record<string, unknown>);
        const vec = vectors?.[i];
        if (insVec && vec) {
          const rowid = BigInt(info.lastInsertRowid as number | bigint);
          const buf = Buffer.from(new Float32Array(vec).buffer);
          insVec.run(rowid, buf);
        }
      }
    });
    tx();
  }

  setMeta(meta?: IndexMeta): void {
    const ins = this.db.prepare(
      "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?, ?)",
    );
    const tx = this.db.transaction(() => {
      ins.run("schema_version", String(SCHEMA_VERSION));
      ins.run("built_at", new Date().toISOString());
      if (meta) {
        ins.run("mode", "hybrid");
        ins.run("model_id", meta.modelId);
        ins.run("dim", String(meta.dim));
        ins.run("quant", meta.quant);
        ins.run("model_sha256", meta.modelSha256);
      } else {
        ins.run("mode", "fts-only");
      }
    });
    tx();
  }

  readMeta(): Record<string, string> {
    const rows = this.db.prepare("SELECT key, value FROM index_meta").all() as {
      key: string;
      value: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  counts(): Counts {
    const n = (sql: string) => (this.db.prepare(sql).get() as { c: number }).c;
    return {
      chunks: n("SELECT COUNT(*) c FROM chunks"),
      fts: n("SELECT COUNT(*) c FROM chunks_fts"),
      vec: this.tableExists("vec_chunks") ? n("SELECT COUNT(*) c FROM vec_chunks") : 0,
    };
  }

  vecKnn(queryVec: number[], k: number, filter: MetaFilter = {}): VecHit[] {
    if (!this.tableExists("vec_chunks")) return [];
    const { clause, binds } = buildWhere(filter);
    const knnLimit = clause ? Math.max(k * 8, 64) : k;
    const buf = Buffer.from(new Float32Array(queryVec).buffer);
    const sql = `
      SELECT ${CHUNK_COLS}, k.distance
      FROM (
        SELECT rowid, distance FROM vec_chunks
        WHERE embedding MATCH ? ORDER BY distance LIMIT ?
      ) k
      JOIN chunks c ON c.id = k.rowid
      ${clause ? `WHERE ${clause}` : ""}
      ORDER BY k.distance
      LIMIT ?`;
    return this.db.prepare(sql).all(buf, knnLimit, ...binds, k) as VecHit[];
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