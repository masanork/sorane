use crate::search_chunker::chunk_document;
use crate::search_embed::{embed_batch, model_available, EmbedMeta};
use crate::search_store::{hash_content, IndexMeta, IndexStore};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct IncrementalPlan {
    pub added: Vec<String>,
    pub changed: Vec<String>,
    pub removed: Vec<String>,
    pub unchanged: Vec<String>,
}

pub fn plan_incremental(disk: &HashMap<String, String>, indexed: &HashMap<String, String>) -> IncrementalPlan {
    let mut added = Vec::new();
    let mut changed = Vec::new();
    let mut unchanged = Vec::new();
    for (source, hash) in disk {
        match indexed.get(source) {
            None => added.push(source.clone()),
            Some(prev) if prev == hash => unchanged.push(source.clone()),
            Some(_) => changed.push(source.clone()),
        }
    }
    let mut removed = Vec::new();
    for source in indexed.keys() {
        if !disk.contains_key(source) {
            removed.push(source.clone());
        }
    }
    added.sort();
    changed.sort();
    removed.sort();
    unchanged.sort();
    IncrementalPlan {
        added,
        changed,
        removed,
        unchanged,
    }
}

#[derive(Debug, Clone)]
pub struct SearchBuildConfig<'a> {
    pub root: &'a str,
    pub index_path: &'a str,
    pub force: bool,
    pub hybrid: bool,
    pub model_root: &'a str,
    pub model_id: &'a str,
}

#[derive(Debug)]
pub struct SearchBuildOutcome {
    pub hybrid: bool,
    pub model_missing: bool,
    pub embed_meta: Option<EmbedMeta>,
}

pub fn build_search_index(
    md_files: &[(&str, &str)],
    cfg: &SearchBuildConfig<'_>,
) -> Result<SearchBuildOutcome, String> {
    let mut disk = HashMap::new();
    let mut contents = HashMap::new();
    for (rel, source) in md_files {
        disk.insert(rel.to_string(), hash_content(source));
        contents.insert(rel.to_string(), source.to_string());
    }

    let hybrid_requested = cfg.hybrid;
    let hybrid_enabled = hybrid_requested && model_available(cfg.root, cfg.model_root, cfg.model_id);
    let model_missing = hybrid_requested && !hybrid_enabled;
    let dim = if hybrid_enabled { 256 } else { 256 };

    let store = IndexStore::open(Path::new(cfg.index_path), cfg.force, dim)?;
    let indexed = if cfg.force {
        HashMap::new()
    } else {
        store.source_hashes()?
    };
    let plan = plan_incremental(&disk, &indexed);

    for rel in &plan.removed {
        store.delete_by_source(rel)?;
    }

    let mut targets: Vec<String> = plan.added.iter().chain(plan.changed.iter()).cloned().collect();
    targets.sort();
    let mut embed_meta: Option<EmbedMeta> = None;

    for rel in targets {
        let source = contents.get(&rel).ok_or_else(|| format!("missing content for {rel}"))?;
        let sha = disk.get(&rel).ok_or_else(|| format!("missing hash for {rel}"))?;
        store.delete_by_source(&rel)?;
        let chunks = chunk_document(source, &rel);
        if chunks.is_empty() {
            store.set_source_hash(&rel, sha)?;
            continue;
        }
        let vectors = if hybrid_enabled {
            let texts: Vec<String> = chunks.iter().map(|c| c.text.clone()).collect();
            let (vecs, meta) = embed_batch(cfg.root, cfg.model_root, cfg.model_id, &texts)?;
            if embed_meta.is_none() {
                embed_meta = Some(meta);
            }
            Some(vecs)
        } else {
            None
        };
        store.add_chunks(&chunks, vectors.as_deref())?;
        store.set_source_hash(&rel, sha)?;
    }

    if hybrid_enabled {
        if let Some(ref meta) = embed_meta {
            store.set_meta(Some(&IndexMeta {
                model_id: meta.model_id.clone(),
                dim: meta.dim,
                quant: meta.quant.clone(),
                model_sha256: meta.model_sha256.clone(),
                mode: "hybrid".to_string(),
            }))?;
        }
    } else {
        store.set_meta(None)?;
    }

    let (chunks, fts, vec) = store.counts()?;
    if chunks != fts {
        return Err(format!("index mismatch: chunks={chunks} fts={fts}"));
    }
    if hybrid_enabled && chunks != vec {
        return Err(format!("index mismatch: chunks={chunks} vec={vec}"));
    }

    Ok(SearchBuildOutcome {
        hybrid: hybrid_enabled,
        model_missing,
        embed_meta,
    })
}