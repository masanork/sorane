use crate::search_chunker::{chunk_document, SearchChunk};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[cfg(not(target_arch = "wasm32"))]
use crate::search_build::{build_search_index, SearchBuildConfig};
#[cfg(not(target_arch = "wasm32"))]
use crate::search_store::{IndexStore, StoredChunk};

pub const FTS_WEB_INDEX_SCHEMA_VERSION: i32 = 4;
pub const WEB_INDEX_SCHEMA_VERSION: i32 = 3;
pub const SNIPPET_LEN: usize = 220;
pub const INT8_SCALE: i32 = 127;

/** Quantize one normalized embedding dimension (must match `@sorane/search` int8-encode.ts). */
pub fn quantize_embedding_component(v: f32) -> i8 {
    let q = (v * INT8_SCALE as f32).round() as i32;
    q.clamp(-127, 127) as i8
}

const IPTC_BASE: &str = "http://cv.iptc.org/newscodes/digitalsourcetype";
const PHASE1_CODES: &[&str] = &[
    "trainedAlgorithmicMedia",
    "compositeWithTrainedAlgorithmicMedia",
    "compositeSynthetic",
    "algorithmicMedia",
    "humanEdits",
    "digitalCreation",
];
const RETIRED_ALIASES: &[(&str, &str)] = &[("digitalArt", "digitalCreation")];

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendSearchInput {
    #[serde(rename = "indexPath", default)]
    pub index_path: Option<String>,
    #[serde(default)]
    pub force: Option<bool>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(rename = "modelRoot", default)]
    pub model_root: Option<String>,
    #[serde(rename = "modelId", default)]
    pub model_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct FtsWebChunk {
    source: String,
    url: String,
    heading_slug: String,
    heading_path: String,
    doc_type: String,
    title: String,
    tags: String,
    snippet: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "digital_source_type")]
    digital_source_type: Option<String>,
}

#[derive(Debug, Serialize)]
struct FtsWebIndex {
    schema_version: i32,
    mode: &'static str,
    built_at: String,
    chunks: Vec<FtsWebChunk>,
}

#[derive(Debug, Serialize)]
struct HybridWebChunk {
    source: String,
    url: String,
    heading_slug: String,
    heading_path: String,
    doc_type: String,
    title: String,
    tags: String,
    snippet: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "digital_source_type")]
    digital_source_type: Option<String>,
}

#[derive(Debug, Serialize)]
struct HybridModelMeta {
    id: String,
    dim: i32,
    quant: String,
    sha256: String,
}

#[derive(Debug, Serialize)]
struct HybridEmbeddings {
    dim: i32,
    encoding: &'static str,
    scale: i32,
    vectors_b64: String,
}

#[derive(Debug, Serialize)]
struct HybridWebIndex {
    schema_version: i32,
    mode: &'static str,
    built_at: String,
    model: HybridModelMeta,
    chunks: Vec<HybridWebChunk>,
    embeddings: HybridEmbeddings,
}

pub fn to_snippet(text: &str, max: usize) -> String {
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.len() <= max {
        flat
    } else {
        format!("{}…", &flat[..max])
    }
}

fn resolve_digital_source_type(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let code = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let normalized = trimmed.trim_end_matches('/');
        let prefix = format!("{IPTC_BASE}/");
        let http_uri = normalized.replacen("https://", "http://", 1);
        if !http_uri.starts_with(&prefix) {
            return None;
        }
        http_uri[prefix.len()..].to_string()
    } else {
        trimmed.to_string()
    };
    let mut resolved = code;
    for (from, to) in RETIRED_ALIASES {
        if resolved == *from {
            resolved = (*to).to_string();
            break;
        }
    }
    if !PHASE1_CODES.contains(&resolved.as_str()) {
        return None;
    }
    Some(format!("{IPTC_BASE}/{resolved}"))
}

fn build_disclosure_map(files: &[(&str, &str)]) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for (rel_path, source) in files {
        if map.contains_key(*rel_path) {
            continue;
        }
        let Some((fm, _)) = crate::validate::extract_frontmatter_for_validation(source) else {
            continue;
        };
        let Ok(yaml) = serde_yaml::from_str::<serde_yaml::Value>(fm) else {
            continue;
        };
        let Some(dst) = yaml
            .get("digitalSourceType")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        if let Some(uri) = resolve_digital_source_type(dst) {
            map.insert(rel_path.to_string(), uri);
        }
    }
    map
}

fn disclosure_for_source(source: &str, disclosure_map: &BTreeMap<String, String>) -> Option<String> {
    disclosure_map.get(source).cloned()
}

fn build_fts_web_index_from_chunks(
    rows: &[SearchChunk],
    source_to_url: impl Fn(&str) -> String,
    disclosure_map: &BTreeMap<String, String>,
) -> FtsWebIndex {
    let chunks: Vec<FtsWebChunk> = rows
        .iter()
        .map(|r| FtsWebChunk {
            source: r.source.clone(),
            url: source_to_url(&r.source),
            heading_slug: r.heading_slug.clone(),
            heading_path: r.heading_path.clone(),
            doc_type: r.doc_type.clone(),
            title: r.title.clone(),
            tags: r.tags.clone(),
            snippet: to_snippet(&r.text, SNIPPET_LEN),
            text: Some(r.text.clone()),
            digital_source_type: disclosure_for_source(&r.source, disclosure_map),
        })
        .collect();
    FtsWebIndex {
        schema_version: FTS_WEB_INDEX_SCHEMA_VERSION,
        mode: "fts",
        built_at: iso_timestamp_now(),
        chunks,
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn build_hybrid_web_index(
    rows: &[StoredChunk],
    vectors: &[Vec<f32>],
    meta: &std::collections::HashMap<String, String>,
    source_to_url: impl Fn(&str) -> String,
    disclosure_map: &BTreeMap<String, String>,
) -> Result<HybridWebIndex, String> {
    if rows.len() != vectors.len() {
        return Err(format!(
            "row/vector count mismatch: {} != {}",
            rows.len(),
            vectors.len()
        ));
    }
    let dim = meta
        .get("dim")
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(vectors.first().map(|v| v.len() as i32).unwrap_or(0));
    let mut kept: Vec<(&StoredChunk, &[f32])> = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        let vec = &vectors[i];
        if vec.is_empty() {
            continue;
        }
        kept.push((row, vec.as_slice()));
    }
    let kept_len = kept.len();
    let mut buf = vec![0i8; kept_len * dim as usize];
    for (i, (_, vec)) in kept.iter().enumerate() {
        if vec.len() as i32 != dim {
            return Err(format!(
                "dimension mismatch chunk[{i}]: {} != {dim}",
                vec.len()
            ));
        }
        for (j, v) in vec.iter().enumerate() {
            buf[i * dim as usize + j] = quantize_embedding_component(*v);
        }
    }
    let vectors_b64 = STANDARD.encode(bytemuck_cast_i8_slice(&buf));
    let chunks: Vec<HybridWebChunk> = kept
        .iter()
        .map(|(r, _)| HybridWebChunk {
            source: r.source.clone(),
            url: source_to_url(&r.source),
            heading_slug: r.heading_slug.clone(),
            heading_path: r.heading_path.clone(),
            doc_type: r.doc_type.clone(),
            title: r.title.clone(),
            tags: r.tags.clone(),
            snippet: to_snippet(&r.text, SNIPPET_LEN),
            digital_source_type: disclosure_for_source(&r.source, disclosure_map),
        })
        .collect();
    Ok(HybridWebIndex {
        schema_version: WEB_INDEX_SCHEMA_VERSION,
        mode: "hybrid",
        built_at: iso_timestamp_now(),
        model: HybridModelMeta {
            id: meta.get("model_id").cloned().unwrap_or_default(),
            dim,
            quant: meta.get("quant").cloned().unwrap_or_default(),
            sha256: meta.get("model_sha256").cloned().unwrap_or_default(),
        },
        chunks,
        embeddings: HybridEmbeddings {
            dim,
            encoding: "int8",
            scale: INT8_SCALE,
            vectors_b64,
        },
    })
}

fn bytemuck_cast_i8_slice(buf: &[i8]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(buf.as_ptr() as *const u8, buf.len())
    }
}

fn html_rel_for_content(
    rel_path: &str,
    permalink: &str,
    collections: &BTreeMap<String, String>,
) -> String {
    let normalized = rel_path.replace('\\', "/");
    let without_ext = normalized
        .trim_end_matches(".mdx")
        .trim_end_matches(".md")
        .to_string();
    let parts: Vec<&str> = without_ext.split('/').collect();
    let collection = parts.first().copied().unwrap_or("");
    let entry_tail = parts.get(1..).unwrap_or(&[]).join("/");
    let route_parts: Vec<String> = match collections.get(collection) {
        Some(base) => {
            let mut out = vec![base.trim_matches('/').to_string()];
            if !entry_tail.is_empty() {
                out.push(entry_tail);
            }
            out
        }
        None => parts.iter().map(|s| s.to_string()).collect(),
    };
    let route = route_parts.join("/");
    if route.is_empty() || route == "index" {
        return "index.html".to_string();
    }
    if route.ends_with("/index") {
        return format!("{}index.html", &route[..route.len() - "index".len()]);
    }
    if permalink == "directory" {
        return format!("{}/index.html", route);
    }
    format!("{}.html", route)
}

fn iso_timestamp_now() -> String {
    // SystemTime::now() traps as `unreachable` on wasm32 without WASI clocks.
    #[cfg(target_arch = "wasm32")]
    let (secs, millis) = {
        let ms = js_sys::Date::now();
        let secs = (ms / 1000.0).floor() as u64;
        let millis = (ms % 1000.0).floor() as u32;
        (secs, millis)
    };
    #[cfg(not(target_arch = "wasm32"))]
    let (secs, millis) = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dur = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        (dur.as_secs(), dur.subsec_millis())
    };
    let days = secs / 86_400;
    let time_of_day = secs % 86_400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{millis:03}Z",
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

fn direct_fts_json(
    md_files: &[(&str, &str)],
    permalink: &str,
    collections: &BTreeMap<String, String>,
) -> Option<String> {
    let mut rows: Vec<SearchChunk> = Vec::new();
    for (rel_path, source) in md_files {
        rows.extend(chunk_document(source, rel_path));
    }
    if rows.is_empty() {
        return None;
    }
    let disclosure_map = build_disclosure_map(md_files);
    let index = build_fts_web_index_from_chunks(
        &rows,
        |source| html_rel_for_content(source, permalink, collections),
        &disclosure_map,
    );
    serde_json::to_string(&index).ok()
}

#[cfg(not(target_arch = "wasm32"))]
pub fn build_search_index_json(
    root: &str,
    files: &[(&str, &str)],
    permalink: &str,
    collections: &BTreeMap<String, String>,
    search: Option<&BackendSearchInput>,
) -> (Option<String>, bool) {
    let md_files: Vec<(&str, &str)> = files
        .iter()
        .copied()
        .filter(|(rel, _)| rel.ends_with(".md"))
        .collect();
    if md_files.is_empty() {
        return (None, false);
    }

    let search_cfg = search.cloned().unwrap_or_default();
    let index_path = search_cfg
        .index_path
        .as_deref()
        .map(|p| {
            if Path::new(p).is_absolute() {
                p.to_string()
            } else {
                Path::new(root).join(p).to_string_lossy().into_owned()
            }
        })
        .unwrap_or_else(|| Path::new(root).join(".sorane/index.db").to_string_lossy().into_owned());
    let force = search_cfg.force.unwrap_or(false);
    let hybrid_requested = search_cfg.mode.as_deref() == Some("hybrid");
    let model_root = search_cfg
        .model_root
        .as_deref()
        .unwrap_or("vendor/models");
    let model_id = search_cfg
        .model_id
        .as_deref()
        .unwrap_or("ruri-v3-30m");

    let build_cfg = SearchBuildConfig {
        root,
        index_path: &index_path,
        force,
        hybrid: hybrid_requested,
        model_root,
        model_id,
    };

    let outcome = match build_search_index(&md_files, &build_cfg) {
        Ok(o) => o,
        Err(err) => {
            eprintln!("[sorane/astro-backend] search index build failed: {err}");
            return (direct_fts_json(&md_files, permalink, collections), false);
        }
    };

    if outcome.model_missing {
        eprintln!(
            "[sorane/astro-backend] hybrid search model not found at {}/{model_id}; indexing FTS-only",
            Path::new(root).join(model_root).display()
        );
    }

    let store = match IndexStore::open(Path::new(&index_path), false, 256) {
        Ok(s) => s,
        Err(_) => return (direct_fts_json(&md_files, permalink, collections), outcome.model_missing),
    };
    let (chunk_count, _, _) = store.counts().unwrap_or((0, 0, 0));
    if chunk_count == 0 {
        return (None, outcome.model_missing);
    }

    let disclosure_map = build_disclosure_map(&md_files);
    let url_fn = |source: &str| html_rel_for_content(source, permalink, collections);

    if outcome.hybrid && store.has_vectors().unwrap_or(false) {
        if let Ok((rows, vectors)) = store.export_all() {
            if let Ok(meta) = store.read_meta() {
                if let Ok(index) =
                    build_hybrid_web_index(&rows, &vectors, &meta, url_fn, &disclosure_map)
                {
                    return (serde_json::to_string(&index).ok(), false);
                }
            }
        }
    }

    if let Ok((rows, _)) = store.export_all() {
        let chunks: Vec<SearchChunk> = rows
            .into_iter()
            .map(|r| SearchChunk {
                source: r.source,
                chunk_index: r.chunk_index as usize,
                text: r.text,
                heading_path: r.heading_path,
                heading_slug: r.heading_slug,
                doc_type: r.doc_type,
                title: r.title,
                timestamp: r.timestamp,
                tags: r.tags,
            })
            .collect();
        let index = build_fts_web_index_from_chunks(&chunks, url_fn, &disclosure_map);
        return (
            serde_json::to_string(&index).ok(),
            outcome.model_missing,
        );
    }
    (direct_fts_json(&md_files, permalink, collections), outcome.model_missing)
}

#[cfg(target_arch = "wasm32")]
pub fn build_search_index_json(
    _root: &str,
    files: &[(&str, &str)],
    permalink: &str,
    collections: &BTreeMap<String, String>,
    _search: Option<&BackendSearchInput>,
) -> (Option<String>, bool) {
    let md_files: Vec<(&str, &str)> = files
        .iter()
        .copied()
        .filter(|(rel, _)| rel.ends_with(".md"))
        .collect();
    (direct_fts_json(&md_files, permalink, collections), false)
}

#[cfg(not(target_arch = "wasm32"))]
use std::path::Path;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippet_collapses_whitespace() {
        assert_eq!(to_snippet("a\n\nb\tc", 100), "a b c");
    }

    #[test]
    fn quantize_embedding_matches_typescript_contract() {
        assert_eq!(quantize_embedding_component(0.1), 13);
        assert_eq!(quantize_embedding_component(-1.0), -127);
        assert_eq!(quantize_embedding_component(1.5), 127);
        assert_eq!(quantize_embedding_component(0.008850927), 1);
    }

    #[test]
    fn builds_fts_index_json() {
        let source = r#"---
type: article
title: Hello
timestamp: 2026-07-04T00:00:00Z
---

# Hello

This section has enough body text to become a searchable chunk when indexed natively.
"#;
        let files = [("posts/hello.md", source)];
        let (json, _) = build_search_index_json("", &files, "html", &BTreeMap::new(), None);
        let json = json.expect("index");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed["mode"], "fts");
        assert_eq!(parsed["schema_version"], FTS_WEB_INDEX_SCHEMA_VERSION);
        assert!(parsed["chunks"].as_array().map(|a| !a.is_empty()).unwrap_or(false));
    }
}