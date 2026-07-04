use crate::search_chunker::{chunk_document, SearchChunk};
use serde::Serialize;
use std::collections::BTreeMap;

pub const FTS_WEB_INDEX_SCHEMA_VERSION: i32 = 4;
pub const SNIPPET_LEN: usize = 220;

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

fn disclosure_for_source(
    source: &str,
    disclosure_map: &BTreeMap<String, String>,
) -> Option<String> {
    disclosure_map.get(source).cloned()
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

fn build_fts_web_index(
    rows: &[SearchChunk],
    source_to_url: impl Fn(&str) -> String,
    disclosure_map: &BTreeMap<String, String>,
) -> FtsWebIndex {
    let chunks: Vec<FtsWebChunk> = rows
        .iter()
        .map(|r| {
            FtsWebChunk {
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
            }
        })
        .collect();
    FtsWebIndex {
        schema_version: FTS_WEB_INDEX_SCHEMA_VERSION,
        mode: "fts",
        built_at: iso_timestamp_now(),
        chunks,
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

pub fn build_search_index_json(
    files: &[(&str, &str)],
    permalink: &str,
    collections: &BTreeMap<String, String>,
) -> Option<String> {
    let md_files: Vec<(&str, &str)> = files
        .iter()
        .copied()
        .filter(|(rel, _)| rel.ends_with(".md"))
        .collect();
    if md_files.is_empty() {
        return None;
    }

    let mut rows: Vec<SearchChunk> = Vec::new();
    for (rel_path, source) in &md_files {
        rows.extend(chunk_document(source, rel_path));
    }
    if rows.is_empty() {
        return None;
    }

    let disclosure_map = build_disclosure_map(&md_files);
    let index = build_fts_web_index(
        &rows,
        |source| html_rel_for_content(source, permalink, collections),
        &disclosure_map,
    );
    serde_json::to_string(&index).ok()
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    #[test]
    fn snippet_collapses_whitespace() {
        assert_eq!(to_snippet("a\n\nb\tc", 100), "a b c");
    }

    #[test]
    fn builds_index_json() {
        let source = r#"---
type: article
title: Hello
timestamp: 2026-07-04T00:00:00Z
---

# Hello

This section has enough body text to become a searchable chunk when indexed natively.
"#;
        let files = [("posts/hello.md", source)];
        let json = build_search_index_json(&files, "html", &BTreeMap::new()).expect("index");
        let parsed: Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed["mode"], json!("fts"));
        assert_eq!(parsed["schema_version"], FTS_WEB_INDEX_SCHEMA_VERSION);
        assert!(parsed["chunks"].as_array().map(|a| !a.is_empty()).unwrap_or(false));
    }
}