/**
 * Write a Definition Profile OKFC SQLite file (FTS + chunks; optional vec_chunks when IR has embeddings).
 * Prefer packing from Knowledge IR so site/units share one chunk pipeline (U1/U3).
 */

import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  OKFC_OKF_VERSION,
  OKFC_PACK_TOOL,
  OKFC_SCHEMA_SQL,
  OKFC_SCHEMA_VERSION,
  type OkfcMetaInput,
  type OkfcPackConcept,
} from "./okfc.ts";
import {
  buildKnowledgeIr,
  type KnowledgeIr,
} from "./knowledge-ir.ts";

export interface PackOkfcOptions {
  readonly dbPath: string;
  readonly concepts: readonly OkfcPackConcept[];
  readonly meta: OkfcMetaInput;
  /** When true, delete existing file first. Default true. */
  readonly fresh?: boolean;
}

export interface PackOkfcFromIrOptions {
  readonly dbPath: string;
  readonly ir: KnowledgeIr;
  readonly meta: OkfcMetaInput;
  readonly fresh?: boolean;
}

export interface PackOkfcResult {
  readonly dbPath: string;
  readonly conceptCount: number;
  readonly chunkCount: number;
  readonly vectorCount: number;
  readonly packedAt: string;
  readonly search: "fts" | "hybrid";
}

type BetterSqliteDatabase = {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid: number | bigint };
  };
  pragma(src: string): unknown;
  close(): void;
  loadExtension?(path: string): void;
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
      `OKFC pack requires better-sqlite3 (npm install better-sqlite3): ${msg}`,
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

function openFreshDb(
  Database: BetterSqliteCtor,
  dbPath: string,
  fresh: boolean,
): BetterSqliteDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });
  if (fresh && existsSync(dbPath)) {
    rmSync(dbPath, { force: true });
    for (const suffix of ["-wal", "-shm"]) {
      const side = `${dbPath}${suffix}`;
      if (existsSync(side)) rmSync(side, { force: true });
    }
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  db.exec(OKFC_SCHEMA_SQL);
  return db;
}

function writeIrToDb(
  db: BetterSqliteDatabase,
  ir: KnowledgeIr,
  meta: OkfcMetaInput,
  packedAt: string,
  writeVectors: boolean,
): { conceptCount: number; chunkCount: number; vectorCount: number } {
  const setMeta = db.prepare(
    "INSERT OR REPLACE INTO okfc_meta(key, value) VALUES(?, ?)",
  );
  const metaRows: [string, string][] = [
    ["schema_version", String(OKFC_SCHEMA_VERSION)],
    ["okf_version", meta.okf_version ?? OKFC_OKF_VERSION],
    ["bundle_id", meta.bundle_id],
    ["packed_at", packedAt],
    ["pack_tool", meta.pack_tool ?? OKFC_PACK_TOOL],
  ];
  if (meta.title) metaRows.push(["title", meta.title]);
  if (meta.description) metaRows.push(["description", meta.description]);
  if (meta.bundle_type) metaRows.push(["bundle_type", meta.bundle_type]);
  if (meta.bundle_uri) metaRows.push(["bundle_uri", meta.bundle_uri]);
  if (ir.model && writeVectors) {
    metaRows.push(["model_id", ir.model.model_id]);
    metaRows.push(["model_dim", String(ir.model.dim)]);
    if (ir.model.quant) metaRows.push(["model_quant", ir.model.quant]);
    if (ir.model.model_sha256) {
      metaRows.push(["model_sha256", ir.model.model_sha256]);
    }
  }
  for (const [k, v] of metaRows) setMeta.run(k, v);

  const embByHash = new Map<string, Float32Array | number[]>();
  if (writeVectors && ir.embeddings) {
    for (const e of ir.embeddings) embByHash.set(e.text_hash, e.vector);
  }

  let insVec: { run(...params: unknown[]): unknown } | null = null;
  if (writeVectors && ir.model) {
    const dim = ir.model.dim;
    db.exec(
      `CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding FLOAT[${dim}])`,
    );
    insVec = db.prepare(
      "INSERT INTO vec_chunks(rowid, embedding) VALUES (?, ?)",
    );
  }

  const insConcept = db.prepare(`
      INSERT INTO concepts (
        id, type, title, description, resource, tags, status, stale_after,
        generated_by, generated_at, frontmatter, body, body_format, source_hash, packed_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
  const insSource = db.prepare(`
      INSERT INTO sources(concept_id, source_id, resource, title, author, usage_count, last_modified)
      VALUES (?,?,?,?,?,?,?)
    `);
  const insVerified = db.prepare(`
      INSERT INTO verified(concept_id, verified_by, verified_at) VALUES (?,?,?)
    `);
  const insChunk = db.prepare(`
      INSERT INTO chunks(concept_id, chunk_index, heading_path, heading_slug, chunk_format, field_id, text, source_hash)
      VALUES (?,?,?,?,?,?,?,?)
    `);

  const concepts = [...ir.concepts].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const chunksByConcept = new Map<string, KnowledgeIr["chunks"][number][]>();
  for (const c of ir.chunks) {
    const list = chunksByConcept.get(c.concept_id) ?? [];
    list.push(c);
    chunksByConcept.set(c.concept_id, list);
  }

  let chunkCount = 0;
  let vectorCount = 0;
  for (const entry of concepts) {
    const p = entry.pack;
    insConcept.run(
      entry.id,
      p.type,
      p.title,
      p.description,
      p.resource,
      p.tags,
      p.status,
      p.stale_after,
      p.generated_by,
      p.generated_at,
      p.frontmatter,
      p.body,
      p.body_format,
      entry.source_hash,
      packedAt,
    );
    for (const s of p.sources) {
      insSource.run(
        entry.id,
        s.source_id,
        s.resource,
        s.title,
        s.author,
        s.usage_count,
        s.last_modified,
      );
    }
    for (const v of p.verified) {
      insVerified.run(entry.id, v.verified_by, v.verified_at);
    }
    const chunks = (chunksByConcept.get(entry.id) ?? [])
      .slice()
      .sort((a, b) => a.chunk_index - b.chunk_index);
    for (const c of chunks) {
      const info = insChunk.run(
        entry.id,
        c.chunk_index,
        c.heading_path,
        c.heading_slug,
        c.chunk_format,
        null,
        c.text,
        c.text_hash,
      );
      chunkCount += 1;
      if (insVec) {
        const vec = embByHash.get(c.text_hash);
        if (vec) {
          const f32 =
            vec instanceof Float32Array ? vec : new Float32Array(vec);
          const rowid = BigInt(info.lastInsertRowid as number | bigint);
          insVec.run(rowid, Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength));
          vectorCount += 1;
        }
      }
    }
  }

  return { conceptCount: concepts.length, chunkCount, vectorCount };
}

/** Pack a Knowledge IR into an OKFC file (canonical U1/U3 path). */
export async function packOkfcFromIr(
  opts: PackOkfcFromIrOptions,
): Promise<PackOkfcResult> {
  const Database = await loadBetterSqlite3();
  const fresh = opts.fresh !== false;
  const db = openFreshDb(Database, opts.dbPath, fresh);
  try {
    const packedAt = new Date().toISOString();
    const wantVectors =
      (opts.ir.embeddings?.length ?? 0) > 0 && opts.ir.model != null;
    let writeVectors = false;
    if (wantVectors) {
      writeVectors = await tryLoadSqliteVec(db);
      if (!writeVectors) {
        throw new Error(
          "OKFC pack has embeddings but sqlite-vec could not be loaded (npm install sqlite-vec)",
        );
      }
    }
    const { conceptCount, chunkCount, vectorCount } = writeIrToDb(
      db,
      opts.ir,
      opts.meta,
      packedAt,
      writeVectors,
    );
    return {
      dbPath: opts.dbPath,
      conceptCount,
      chunkCount,
      vectorCount,
      packedAt,
      search: vectorCount > 0 ? "hybrid" : "fts",
    };
  } finally {
    db.close();
  }
}

/** Pack concepts by building IR first (delegates to packOkfcFromIr). */
export async function packOkfc(opts: PackOkfcOptions): Promise<PackOkfcResult> {
  const ir = buildKnowledgeIr(opts.concepts);
  return packOkfcFromIr({
    dbPath: opts.dbPath,
    ir,
    meta: opts.meta,
    fresh: opts.fresh,
  });
}
