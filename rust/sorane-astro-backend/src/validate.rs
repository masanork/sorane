use serde::Deserialize;
use serde_json::Value;

use crate::content_quality::validate_content_quality_warnings;
use crate::diagram::validate_diagram_alt_warnings;
use crate::directory_index::{discover_directory_index_warnings, DirectoryListingFile};
use crate::faq::validate_faq_warnings;
use crate::glossary::{validate_glossary_term_warnings, validate_glossary_warnings};
use crate::okf_validate::validate_okf_source;

#[derive(Debug, Clone)]
pub enum ValidateMode {
    Off,
    Warn,
    Error,
}

impl<'de> Deserialize<'de> for ValidateMode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let v = Value::deserialize(deserializer)?;
        Ok(match v {
            Value::Bool(false) => ValidateMode::Off,
            Value::String(s) if s == "error" => ValidateMode::Error,
            Value::String(s) if s == "warn" => ValidateMode::Warn,
            _ => ValidateMode::Warn,
        })
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendQuality {
    #[serde(default)]
    pub heading: Option<Value>,
    #[serde(rename = "image_alt", default)]
    pub image_alt: Option<Value>,
    #[serde(rename = "link_text", default)]
    pub link_text: Option<Value>,
    #[serde(rename = "table_headers", default)]
    pub table_headers: Option<Value>,
    #[serde(default)]
    pub dates: Option<Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendOkf {
    #[serde(rename = "default_profile", default)]
    pub default_profile: Option<String>,
    #[serde(rename = "unknown_type", default)]
    pub unknown_type: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ValidationSummary {
    pub errors: usize,
    pub warnings: usize,
    pub details: Vec<String>,
}

pub fn heading_gate_enabled(quality: &Option<BackendQuality>) -> bool {
    match quality.as_ref().and_then(|q| q.heading.as_ref()) {
        Some(Value::Bool(false)) => false,
        None => true,
        _ => true,
    }
}

pub fn heading_is_error(quality: &Option<BackendQuality>) -> bool {
    matches!(
        quality.as_ref().and_then(|q| q.heading.as_ref()),
        Some(Value::String(s)) if s == "error"
    )
}

fn fence_marker_for_line(line: &str) -> Option<&str> {
    if line.starts_with("```") {
        let len = line.chars().take_while(|c| *c == '`').count();
        if len >= 3 {
            return Some(&line[..len]);
        }
    }
    if line.starts_with("~~~") {
        let len = line.chars().take_while(|c| *c == '~').count();
        if len >= 3 {
            return Some(&line[..len]);
        }
    }
    None
}

const TYPES_03: &[&str] = &[
    "article",
    "index",
    "dataset",
    "reference",
    "glossary",
    "glossary-term",
    "faq",
];

fn yaml_str<'a>(map: &'a serde_yaml::Mapping, key: &str) -> Option<&'a str> {
    map.get(serde_yaml::Value::String(key.into()))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
}

fn yaml_bool(map: &serde_yaml::Mapping, key: &str) -> bool {
    matches!(
        map.get(serde_yaml::Value::String(key.into())),
        Some(serde_yaml::Value::Bool(true))
    )
}

fn resolve_profile(map: &serde_yaml::Mapping, _okf: &Option<BackendOkf>) -> Option<String> {
    let profile = yaml_str(map, "profile")?;
    if regex::Regex::new(r"^sorane-okf/(0\.[123])$")
        .ok()?
        .is_match(profile)
    {
        Some(profile.to_string())
    } else {
        None
    }
}

pub fn effective_type(map: &serde_yaml::Mapping, okf: &Option<BackendOkf>) -> String {
    let mut okf_type = yaml_str(map, "type").unwrap_or("").to_string();
    if okf_type.is_empty() {
        if let Some(kind) = yaml_str(map, "kind") {
            okf_type = kind.to_string();
        }
    }
    let profile = resolve_profile(map, okf).or_else(|| {
        okf.as_ref()
            .and_then(|o| o.default_profile.as_deref())
            .and_then(|p| {
                if regex::Regex::new(r"^sorane-okf/(0\.[123])$")
                    .ok()?
                    .is_match(p)
                {
                    Some(p.to_string())
                } else {
                    None
                }
            })
    });
    if profile.as_deref() == Some("sorane-okf/0.3") && !TYPES_03.contains(&okf_type.as_str()) {
        return "article".to_string();
    }
    okf_type
}

pub fn directory_listing_file_from_source(
    rel_path: &str,
    source: &str,
    okf: &Option<BackendOkf>,
) -> Option<DirectoryListingFile> {
    let (fm, _) = extract_frontmatter_for_validation(source)?;
    let fm_map = serde_yaml::from_str::<serde_yaml::Value>(fm)
        .ok()?
        .as_mapping()
        .cloned()?;
    let okf_type = effective_type(&fm_map, okf);
    if okf_type.is_empty() {
        return None;
    }
    let title = yaml_str(&fm_map, "title")
        .map(|s| s.to_string())
        .unwrap_or_else(|| crate::okf_validate::slug_from_path(rel_path));
    Some(DirectoryListingFile {
        rel_path: rel_path.to_string(),
        okf_type,
        title,
        is_system: yaml_bool(&fm_map, "isSystem"),
        is_redirect: yaml_str(&fm_map, "redirect").is_some(),
        is_search_view: yaml_str(&fm_map, "view") == Some("search"),
    })
}

pub fn extract_frontmatter_for_validation(source: &str) -> Option<(&str, &str)> {
    let rest = source.strip_prefix("---\n").or_else(|| source.strip_prefix("---\r\n"))?;
    for (idx, _) in rest.match_indices("\n---") {
        let fm = &rest[..idx];
        let after = &rest[idx + 1..];
        if let Some(body) = after
            .strip_prefix("---\n")
            .or_else(|| after.strip_prefix("---\r\n"))
        {
            return Some((fm, body));
        }
        if after == "---" {
            return Some((fm, ""));
        }
        if let Some(body) = after.strip_prefix("---\r") {
            return Some((fm, body));
        }
    }
    None
}

pub fn collect_site_validation(files: &[DirectoryListingFile]) -> ValidationSummary {
    let discovered = discover_directory_index_warnings(files);
    let warnings = discovered.len();
    let details: Vec<String> = discovered
        .into_iter()
        .map(|(virtual_file, message)| format!("{virtual_file}: {message}"))
        .collect();
    ValidationSummary {
        errors: 0,
        warnings,
        details,
    }
}

pub fn validate_heading_warnings(body: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    let mut in_fence = false;
    let mut fence_marker = String::new();
    let mut prev_level = 0u8;

    for (i, line) in body.lines().enumerate() {
        if let Some(marker) = fence_marker_for_line(line) {
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

        let level = line.chars().take_while(|c| *c == '#').count() as u8;
        if level == 0 || level > 6 {
            continue;
        }
        let rest = &line[level as usize..];
        if !(rest.starts_with(' ') || rest.starts_with('\t')) {
            continue;
        }
        let line_no = i + 1;

        if level == 1 {
            warnings.push(format!(
                "heading: h1 in body (line {line_no}); page title is already rendered as h1"
            ));
        }
        if prev_level == 0 && level >= 3 {
            warnings.push(format!(
                "heading: first heading in body is h{level} (line {line_no}); prefer starting with h2"
            ));
        } else if prev_level > 0 && level > prev_level + 1 {
            warnings.push(format!(
                "heading: skip from h{prev_level} to h{level} (line {line_no})"
            ));
        }
        prev_level = level;
    }

    warnings
}

pub fn collect_file_validation(
    rel_path: &str,
    frontmatter: Option<&str>,
    body: &str,
    quality: &Option<BackendQuality>,
    okf: &Option<BackendOkf>,
) -> ValidationSummary {
    let mut errors = 0usize;
    let mut warnings = 0usize;
    let mut details = Vec::new();

    let fm_yaml = match frontmatter {
        None => {
            errors += 1;
            details.push(format!(
                "{rel_path}: frontmatter ブロック（--- で囲む）がありません"
            ));
            return ValidationSummary {
                errors,
                warnings,
                details,
            };
        }
        Some(raw) => match serde_yaml::from_str::<serde_yaml::Value>(raw) {
            Ok(v) => v,
            Err(e) => {
                errors += 1;
                details.push(format!(
                    "{rel_path}: frontmatter の YAML 解析に失敗: {e}"
                ));
                return ValidationSummary {
                    errors,
                    warnings,
                    details,
                };
            }
        },
    };

    let fm_map = match fm_yaml {
        serde_yaml::Value::Mapping(m) => m,
        _ => {
            errors += 1;
            details.push(format!("{rel_path}: frontmatter が YAML マッピングではありません"));
            return ValidationSummary {
                errors,
                warnings,
                details,
            };
        }
    };

    let (okf_findings, okf_warnings) = validate_okf_source(rel_path, &fm_map, body, okf);
    for finding in okf_findings {
        if finding.is_error {
            errors += 1;
        } else {
            warnings += 1;
        }
        details.push(format!("{rel_path}: {}", finding.message));
    }
    for message in okf_warnings {
        warnings += 1;
        details.push(format!("{rel_path}: {message}"));
    }

    if heading_gate_enabled(quality) {
        let is_error = heading_is_error(quality);
        for message in validate_heading_warnings(body) {
            if is_error {
                errors += 1;
            } else {
                warnings += 1;
            }
            details.push(format!("{rel_path}: {message}"));
        }
    }

    for message in validate_content_quality_warnings(body, &fm_map, quality) {
        warnings += 1;
        details.push(format!("{rel_path}: {message}"));
    }

    for message in validate_diagram_alt_warnings(body) {
        warnings += 1;
        details.push(format!("{rel_path}: {message}"));
    }

    let okf_type = effective_type(&fm_map, okf);
    match okf_type.as_str() {
        "faq" => {
            for message in validate_faq_warnings(body) {
                warnings += 1;
                details.push(format!("{rel_path}: {message}"));
            }
        }
        "glossary" => {
            for message in validate_glossary_warnings(body, &fm_map) {
                warnings += 1;
                details.push(format!("{rel_path}: {message}"));
            }
        }
        "glossary-term" => {
            for message in validate_glossary_term_warnings(body, &fm_map) {
                warnings += 1;
                details.push(format!("{rel_path}: {message}"));
            }
        }
        _ => {}
    }

    ValidationSummary {
        errors,
        warnings,
        details,
    }
}

pub fn merge_validation(target: &mut ValidationSummary, other: ValidationSummary) {
    target.errors += other.errors;
    target.warnings += other.warnings;
    target.details.extend(other.details);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heading_skip_warning() {
        let warnings = validate_heading_warnings("### skip h2\n");
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("first heading in body is h3"));
    }
}