use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

use crate::glossary::{resolve_glossary_term_items, term_id_from_label};
use crate::validate::{effective_type, extract_frontmatter_for_validation, BackendOkf};

static TERM_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\[term:([^\]|]+)(?:\|[^\]]+)?\]\]").expect("term link"));

pub fn build_glossary_term_index(files: &[(&str, &str)], okf: &Option<BackendOkf>) -> HashSet<String> {
    let mut ids = HashSet::new();
    for (rel_path, source) in files {
        let Some((fm_raw, body)) = extract_frontmatter_for_validation(source) else {
            continue;
        };
        let Ok(fm_yaml) = serde_yaml::from_str::<serde_yaml::Value>(fm_raw) else {
            continue;
        };
        let Some(fm_map) = fm_yaml.as_mapping() else {
            continue;
        };
        let okf_type = effective_type(fm_map, okf);
        if okf_type == "glossary-term" {
            if let Some(id) = fm_map
                .get(serde_yaml::Value::String("term_id".into()))
                .or_else(|| fm_map.get(serde_yaml::Value::String("termId".into())))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                ids.insert(id.to_string());
            }
        }
        if okf_type == "glossary" {
            for term in resolve_glossary_term_items(body, fm_map) {
                let id = term
                    .anchor_id
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| term_id_from_label(&term.label));
                if !id.is_empty() {
                    ids.insert(id);
                }
            }
        }
        let _ = rel_path;
    }
    ids
}

pub fn validate_term_link_warnings(body: &str, index: &HashSet<String>) -> Vec<String> {
    let mut warnings = Vec::new();
    let mut seen = HashSet::new();
    for cap in TERM_LINK_RE.captures_iter(body) {
        let term_id = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
        if term_id.is_empty() || !seen.insert(term_id.to_string()) {
            continue;
        }
        if !index.contains(term_id) {
            warnings.push(format!("unresolved glossary term link: [[term:{term_id}]]"));
        }
    }
    warnings
}