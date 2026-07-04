use crate::search_chunker::SearchChunk;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;

pub const SCHEMA_VERSION: i32 = 2;

const SCHEMA: &str = r#"
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

CREATE TABLE source_meta (
  source TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL
);

CREATE TABLE chunk_vectors (
  chunk_id INTEGER PRIMARY KEY,
  embedding BLOB NOT NULL
);
"#;

#[derive(Debug, Clone)]
pub struct StoredChunk {
    pub id: i64,
    pub source: String,
    pub chunk_index: i32,
    pub text: String,
    pub heading_path: String,
    pub heading_slug: String,
    pub doc_type: String,
    pub title: String,
    pub timestamp: String,
    pub tags: String,
}

#[derive(Debug, Clone, Default)]
pub struct IndexMeta {
    pub model_id: String,
    pub dim: i32,
    pub quant: String,
    pub model_sha256: String,
    pub mode: String,
}

pub struct IndexStore {
    conn: Connection,
}

impl IndexStore {
    pub fn open(db_path: &Path, fresh: bool, _dim: i32) -> Result<Self, String> {
        if fresh && db_path.exists() {
            std::fs::remove_file(db_path).map_err(|e| e.to_string())?;
        }
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        let store = Self { conn };
        if !store.table_exists("chunks")? {
            store.conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        }
        Ok(store)
    }

    fn table_exists(&self, name: &str) -> Result<bool, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?1")
            .map_err(|e| e.to_string())?;
        let exists = stmt
            .exists(params![name])
            .map_err(|e| e.to_string())?;
        Ok(exists)
    }

    pub fn has_vectors(&self) -> Result<bool, String> {
        if !self.table_exists("chunk_vectors")? {
            return Ok(false);
        }
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM chunk_vectors", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(count > 0)
    }

    pub fn delete_by_source(&self, source: &str) -> Result<(), String> {
        let mut ids_stmt = self
            .conn
            .prepare("SELECT id FROM chunks WHERE source = ?1")
            .map_err(|e| e.to_string())?;
        let ids: Vec<i64> = ids_stmt
            .query_map(params![source], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for id in ids {
            tx.execute("DELETE FROM chunk_vectors WHERE chunk_id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        tx.execute("DELETE FROM chunks WHERE source = ?1", params![source])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM source_meta WHERE source = ?1", params![source])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn source_hashes(&self) -> Result<HashMap<String, String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT source, sha256 FROM source_meta")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut map = HashMap::new();
        for row in rows {
            let (k, v) = row.map_err(|e| e.to_string())?;
            map.insert(k, v);
        }
        Ok(map)
    }

    pub fn set_source_hash(&self, source: &str, sha256: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO source_meta(source, sha256) VALUES (?1, ?2)",
                params![source, sha256],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_chunks(
        &self,
        chunks: &[SearchChunk],
        vectors: Option<&[Vec<f32>]>,
    ) -> Result<(), String> {
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for (i, chunk) in chunks.iter().enumerate() {
            tx.execute(
                "INSERT INTO chunks
                  (source, chunk_index, text, heading_path, heading_slug, doc_type, title, timestamp, tags)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    chunk.source,
                    chunk.chunk_index as i32,
                    chunk.text,
                    chunk.heading_path,
                    chunk.heading_slug,
                    chunk.doc_type,
                    chunk.title,
                    chunk.timestamp,
                    chunk.tags,
                ],
            )
            .map_err(|e| e.to_string())?;
            let chunk_id = tx.last_insert_rowid();
            if let Some(vecs) = vectors {
                if let Some(vec) = vecs.get(i) {
                    let bytes: Vec<u8> = vec
                        .iter()
                        .flat_map(|f| f.to_le_bytes())
                        .collect();
                    tx.execute(
                        "INSERT OR REPLACE INTO chunk_vectors(chunk_id, embedding) VALUES (?1, ?2)",
                        params![chunk_id, bytes],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_meta(&self, meta: Option<&IndexMeta>) -> Result<(), String> {
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
            params!["schema_version", SCHEMA_VERSION.to_string()],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
            params!["built_at", iso_timestamp_now()],
        )
        .map_err(|e| e.to_string())?;
        match meta {
            Some(m) => {
                tx.execute(
                    "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
                    params!["mode", "hybrid"],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
                    params!["model_id", &m.model_id],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
                    params!["dim", m.dim.to_string()],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
                    params!["quant", &m.quant],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
                    params!["model_sha256", &m.model_sha256],
                )
                .map_err(|e| e.to_string())?;
            }
            None => {
                tx.execute(
                    "INSERT OR REPLACE INTO index_meta(key, value) VALUES (?1, ?2)",
                    params!["mode", "fts-only"],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn read_meta(&self) -> Result<HashMap<String, String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM index_meta")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut map = HashMap::new();
        for row in rows {
            let (k, v) = row.map_err(|e| e.to_string())?;
            map.insert(k, v);
        }
        Ok(map)
    }

    pub fn counts(&self) -> Result<(i64, i64, i64), String> {
        let chunks: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let fts: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM chunks_fts", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let vec: i64 = if self.table_exists("chunk_vectors")? {
            self.conn
                .query_row("SELECT COUNT(*) FROM chunk_vectors", [], |r| r.get(0))
                .map_err(|e| e.to_string())?
        } else {
            0
        };
        Ok((chunks, fts, vec))
    }

    pub fn export_all(&self) -> Result<(Vec<StoredChunk>, Vec<Vec<f32>>), String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.id, c.source, c.chunk_index, c.text, c.heading_path, c.heading_slug,
                        c.doc_type, c.title, c.timestamp, c.tags
                 FROM chunks c ORDER BY c.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(StoredChunk {
                    id: r.get(0)?,
                    source: r.get(1)?,
                    chunk_index: r.get(2)?,
                    text: r.get(3)?,
                    heading_path: r.get(4)?,
                    heading_slug: r.get(5)?,
                    doc_type: r.get(6)?,
                    title: r.get(7)?,
                    timestamp: r.get(8)?,
                    tags: r.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut chunks = Vec::new();
        let mut vectors = Vec::new();
        for row in rows {
            let chunk = row.map_err(|e| e.to_string())?;
            let vec = self.read_vector(chunk.id)?;
            chunks.push(chunk);
            vectors.push(vec);
        }
        Ok((chunks, vectors))
    }

    fn read_vector(&self, chunk_id: i64) -> Result<Vec<f32>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT embedding FROM chunk_vectors WHERE chunk_id = ?1")
            .map_err(|e| e.to_string())?;
        let blob: Option<Vec<u8>> = stmt
            .query_row(params![chunk_id], |r| r.get(0))
            .ok();
        let Some(bytes) = blob else {
            return Ok(Vec::new());
        };
        if bytes.len() % 4 != 0 {
            return Err(format!("invalid embedding blob length for chunk {chunk_id}"));
        }
        Ok(bytes
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect())
    }
}

fn iso_timestamp_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let nanos = dur.subsec_nanos();
    let days = secs / 86_400;
    let time_of_day = secs % 86_400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{:03}Z",
        nanos / 1_000_000
    )
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_097 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    (y as i32, m as u32, d as u32)
}

pub fn hash_content(content: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(content.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}