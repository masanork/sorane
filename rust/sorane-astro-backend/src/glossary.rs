use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

use crate::markdown_sections::{split_markdown_on_h2, MarkdownSection};

static FENCE_OPEN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(```+|~~~+)").expect("fence re"));
static HEADING_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(#{1,6})\s+").expect("heading re"));

#[derive(Debug, Clone)]
pub struct GlossaryTermItem {
    pub label: String,
    pub definition_markdown: String,
    pub line: usize,
    pub anchor_id: Option<String>,
}

struct GlossaryTerm {
    label: String,
    definition_markdown: String,
    line: usize,
    anchor_id: Option<String>,
}

pub fn term_id_from_label(label: &str) -> String {
    let slug = label.trim().to_lowercase().replace(' ', "-");
    let re = regex::Regex::new(r"[^a-z0-9\u3040-\u30ff\u4e00-\u9fff-]").unwrap();
    re.replace_all(&slug, "").to_string()
}

fn parse_glossary_terms_frontmatter(fm: &serde_yaml::Mapping) -> Vec<GlossaryTerm> {
    let Some(serde_yaml::Value::Sequence(raw)) = fm.get(serde_yaml::Value::String("terms".into()))
    else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for (i, entry) in raw.iter().enumerate() {
        let serde_yaml::Value::Mapping(rec) = entry else {
            continue;
        };
        let label = rec
            .get(serde_yaml::Value::String("label".into()))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let Some(label) = label else {
            continue;
        };
        let definition = rec
            .get(serde_yaml::Value::String("definition".into()))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let anchor_id = rec
            .get(serde_yaml::Value::String("id".into()))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        items.push(GlossaryTerm {
            label: label.to_string(),
            definition_markdown: definition,
            line: i + 1,
            anchor_id,
        });
    }
    items
}

fn sections_to_terms(sections: &[MarkdownSection]) -> Vec<GlossaryTerm> {
    sections
        .iter()
        .map(|s| GlossaryTerm {
            label: s.label.clone(),
            definition_markdown: s.body_markdown.clone(),
            line: s.line,
            anchor_id: s.anchor_id.clone(),
        })
        .collect()
}

struct ResolvedGlossaryTerms {
    items: Vec<GlossaryTerm>,
    preamble_markdown: String,
    preamble_line: Option<usize>,
    source: &'static str,
}

pub fn resolve_glossary_term_items(body: &str, fm: &serde_yaml::Mapping) -> Vec<GlossaryTermItem> {
    resolve_glossary_terms(body, fm)
        .items
        .into_iter()
        .map(|t| GlossaryTermItem {
            label: t.label,
            definition_markdown: t.definition_markdown,
            line: t.line,
            anchor_id: t.anchor_id,
        })
        .collect()
}

fn resolve_glossary_terms(body: &str, fm: &serde_yaml::Mapping) -> ResolvedGlossaryTerms {
    let body_split = split_markdown_on_h2(body);
    let body_terms = sections_to_terms(&body_split.sections);
    let fm_terms = parse_glossary_terms_frontmatter(fm);
    if !body_terms.is_empty() {
        return ResolvedGlossaryTerms {
            items: body_terms,
            preamble_markdown: body_split.preamble_markdown,
            preamble_line: body_split.preamble_line,
            source: "body",
        };
    }
    ResolvedGlossaryTerms {
        items: fm_terms,
        preamble_markdown: body_split.preamble_markdown,
        preamble_line: body_split.preamble_line,
        source: "frontmatter",
    }
}

pub fn validate_glossary_warnings(body: &str, fm: &serde_yaml::Mapping) -> Vec<String> {
    let mut warnings = Vec::new();
    let body_split = split_markdown_on_h2(body);
    let body_terms = sections_to_terms(&body_split.sections);
    let fm_terms = parse_glossary_terms_frontmatter(fm);
    let resolved = resolve_glossary_terms(body, fm);

    if !body_terms.is_empty() && !fm_terms.is_empty() {
        warnings.push(
            "glossary: both body ## terms and frontmatter terms: present; build uses body terms"
                .to_string(),
        );
    }

    if resolved.items.is_empty() {
        warnings.push(
            "glossary: no terms found; use ## headings in body or a frontmatter terms: list"
                .to_string(),
        );
        return warnings;
    }

    if resolved.source == "body"
        && !resolved.preamble_markdown.trim().is_empty()
        && resolved.preamble_line.is_some()
    {
        let line = resolved.preamble_line.unwrap();
        warnings.push(format!(
            "glossary: content before first term (line {line}); start body with ##"
        ));
    }

    let mut anchor_ids = HashSet::new();
    for term in &resolved.items {
        if term.definition_markdown.trim().is_empty() {
            warnings.push(format!(
                "glossary: empty definition for \"{}\" (line {})",
                term.label, term.line
            ));
        }
        if term.anchor_id.is_none() {
            warnings.push(format!(
                "glossary: term \"{}\" has no {{#id}} anchor (line {}); recommended for cross-glossary links",
                term.label, term.line
            ));
        } else if let Some(ref id) = term.anchor_id {
            if !anchor_ids.insert(id.clone()) {
                warnings.push(format!(
                    "glossary: duplicate anchor id \"{id}\" (line {})",
                    term.line
                ));
            }
        }
    }

    if resolved.source == "body" {
        let mut in_fence = false;
        let mut fence_marker = String::new();
        let mut seen_term = false;
        for (i, line) in body.lines().enumerate() {
            if let Some(m) = FENCE_OPEN_RE.captures(line) {
                let marker = m.get(1).map(|x| x.as_str()).unwrap_or("");
                if !in_fence {
                    in_fence = true;
                    fence_marker = marker.to_string();
                } else if line.starts_with(&fence_marker) {
                    in_fence = false;
                    fence_marker.clear();
                }
                continue;
            }
            if in_fence {
                continue;
            }
            let Some(cap) = HEADING_RE.captures(line) else {
                continue;
            };
            let level = cap.get(1).map(|m| m.as_str().len()).unwrap_or(0);
            if level == 2 {
                seen_term = true;
                continue;
            }
            if !seen_term {
                warnings.push(format!(
                    "glossary: use ## for terms; first heading is h{level} (line {})",
                    i + 1
                ));
            } else if level == 1 {
                warnings.push(format!(
                    "glossary: h1 in body (line {}); use ## for terms",
                    i + 1
                ));
            }
        }
    }

    warnings
}

pub fn validate_glossary_term_warnings(body: &str, fm: &serde_yaml::Mapping) -> Vec<String> {
    let mut warnings = Vec::new();
    if body.trim().is_empty() {
        warnings.push("glossary-term: empty body; add the term definition".to_string());
    }

    let term_id = fm
        .get(serde_yaml::Value::String("term_id".into()))
        .or_else(|| fm.get(serde_yaml::Value::String("termId".into())))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if term_id.is_none() {
        warnings.push(
            "glossary-term: missing term_id (recommended for stable links and transclusion)"
                .to_string(),
        );
    }

    let parent = fm
        .get(serde_yaml::Value::String("inDefinedTermSet".into()))
        .or_else(|| fm.get(serde_yaml::Value::String("glossary".into())))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if parent.is_none() {
        warnings.push(
            "glossary-term: missing inDefinedTermSet or glossary parent href (recommended)"
                .to_string(),
        );
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_terms_warns() {
        let fm = serde_yaml::Mapping::new();
        let warnings = validate_glossary_warnings("Intro only.\n", &fm);
        assert!(warnings.iter().any(|w| w.contains("no terms found")));
    }
}