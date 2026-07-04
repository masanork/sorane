use jsonschema::Validator;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{Map, Value};
use std::collections::HashMap;

use crate::validate::BackendOkf;

static SUPPORTED_PROFILE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^sorane-okf/(0\.[123])$").expect("profile re"));

static SCHEMA_CACHE: Lazy<HashMap<String, Validator>> = Lazy::new(|| {
    let mut cache = HashMap::new();
    for (profile, schema_str) in [
        ("sorane-okf/0.1", include_str!("../profile/sorane-okf-0.1.schema.json")),
        ("sorane-okf/0.2", include_str!("../profile/sorane-okf-0.2.schema.json")),
        ("sorane-okf/0.3", include_str!("../profile/sorane-okf-0.3.schema.json")),
    ] {
        let schema_value: Value = serde_json::from_str(schema_str).expect("schema json");
        let compiled = jsonschema::validator_for(&schema_value).expect("compile schema");
        cache.insert(profile.to_string(), compiled);
    }
    cache
});

const TYPES_01_02: &[&str] = &["article", "index"];
const TYPES_03: &[&str] = &[
    "article",
    "index",
    "dataset",
    "reference",
    "glossary",
    "glossary-term",
    "faq",
];

#[derive(Debug, Clone)]
pub struct OkfValidationFinding {
    pub is_error: bool,
    pub message: String,
    pub instance_path: Option<String>,
}

pub fn slug_from_path(file_path: &str) -> String {
    let normalized = file_path.replace('\\', "/");
    let base = normalized.split('/').next_back().unwrap_or(file_path);
    base.replace(".md", "").replace(".MD", "")
}

fn yaml_to_json(value: &serde_yaml::Value) -> Value {
    match value {
        serde_yaml::Value::Null => Value::Null,
        serde_yaml::Value::Bool(b) => Value::Bool(*b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Number(i.into())
            } else if let Some(u) = n.as_u64() {
                Value::Number(u.into())
            } else {
                Value::Number(serde_json::Number::from_f64(n.as_f64().unwrap_or(0.0)).unwrap_or(0.into()))
            }
        }
        serde_yaml::Value::String(s) => Value::String(s.clone()),
        serde_yaml::Value::Sequence(seq) => Value::Array(seq.iter().map(yaml_to_json).collect()),
        serde_yaml::Value::Mapping(map) => {
            let mut out = Map::new();
            for (k, v) in map {
                let key = match k {
                    serde_yaml::Value::String(s) => s.clone(),
                    _ => continue,
                };
                out.insert(key, yaml_to_json(v));
            }
            Value::Object(out)
        }
        serde_yaml::Value::Tagged(tagged) => yaml_to_json(&tagged.value),
    }
}

fn resolve_type(raw: &serde_yaml::Mapping, warnings: &mut Vec<String>) -> String {
    if let Some(t) = raw
        .get(serde_yaml::Value::String("type".into()))
        .and_then(|v| v.as_str())
    {
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Some(kind) = raw
        .get(serde_yaml::Value::String("kind".into()))
        .and_then(|v| v.as_str())
    {
        if !kind.is_empty() {
            warnings.push("deprecated: `kind` → use `type`".to_string());
            return kind.to_string();
        }
    }
    if let Some(layout) = raw
        .get(serde_yaml::Value::String("layout".into()))
        .and_then(|v| v.as_str())
    {
        if layout == "blog" {
            warnings.push("deprecated: `layout: blog` → use `type: index`".to_string());
            return "index".to_string();
        }
        if layout == "article" {
            warnings.push("deprecated: `layout: article` → use `type: article`".to_string());
            return "article".to_string();
        }
    }
    String::new()
}

fn resolve_title(raw: &serde_yaml::Mapping, body: &str, fallback: &str) -> String {
    if let Some(title) = raw
        .get(serde_yaml::Value::String("title".into()))
        .and_then(|v| v.as_str())
    {
        if !title.is_empty() {
            return title.to_string();
        }
    }
    let heading_re = Regex::new(r"^#{1,6}\s+(.+?)\s*$").ok();
    if let Some(re) = heading_re {
        for line in body.lines() {
            if let Some(cap) = re.captures(line) {
                return cap.get(1).map(|m| m.as_str().trim()).unwrap_or(fallback).to_string();
            }
        }
    }
    fallback.to_string()
}

fn resolve_profile_for_validation(profile: Option<&str>, default_profile: Option<&str>) -> String {
    if let Some(p) = profile {
        if SUPPORTED_PROFILE_RE.is_match(p) {
            return p.to_string();
        }
    }
    if let Some(p) = default_profile {
        if SUPPORTED_PROFILE_RE.is_match(p) {
            return p.to_string();
        }
    }
    "sorane-okf/0.1".to_string()
}

fn validate_profile_format(profile: Option<&str>) -> Option<String> {
    let profile = profile?;
    if SUPPORTED_PROFILE_RE.is_match(profile) {
        None
    } else {
        Some(format!(
            "Unsupported profile \"{profile}\"; supported: sorane-okf/0.1, sorane-okf/0.2, sorane-okf/0.3"
        ))
    }
}

fn validate_type_for_profile(
    okf_type: &str,
    profile: &str,
    unknown_type: &str,
) -> Vec<OkfValidationFinding> {
    let mut findings = Vec::new();
    if okf_type.is_empty() {
        findings.push(OkfValidationFinding {
            is_error: true,
            message: "OKF 必須フィールド `type` がありません".to_string(),
            instance_path: None,
        });
        return findings;
    }
    if profile == "sorane-okf/0.3" {
        if !TYPES_03.contains(&okf_type) {
            let message = format!(
                "unknown type \"{okf_type}\" (sorane-okf/0.3); build treats as article"
            );
            findings.push(OkfValidationFinding {
                is_error: unknown_type == "error",
                message,
                instance_path: None,
            });
        }
        return findings;
    }
    if !TYPES_01_02.contains(&okf_type) {
        findings.push(OkfValidationFinding {
            is_error: true,
            message: format!("未サポートの type: {okf_type}（{profile} は article / index のみ）"),
            instance_path: None,
        });
    }
    findings
}

fn build_fm_for_schema(
    raw: &serde_yaml::Mapping,
    okf_type: &str,
    title: &str,
    profile: &str,
) -> Value {
    let mut obj = Map::new();
    obj.insert("title".to_string(), Value::String(title.to_string()));
    obj.insert("type".to_string(), Value::String(okf_type.to_string()));
    for (k, v) in raw {
        let key = match k {
            serde_yaml::Value::String(s) => s.clone(),
            _ => continue,
        };
        if matches!(key.as_str(), "type" | "kind" | "layout" | "title") {
            continue;
        }
        obj.insert(key, yaml_to_json(v));
    }
    if profile == "sorane-okf/0.3" && !TYPES_03.contains(&okf_type) {
        obj.insert("type".to_string(), Value::String("article".to_string()));
    }
    Value::Object(obj)
}

fn validate_disclosure_fields(
    frontmatter: &Map<String, Value>,
    strict_codes: bool,
) -> (Vec<OkfValidationFinding>, Vec<String>) {
    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    let disclosure_keys = [
        "digitalSourceType",
        "euAiLabel",
        "aiDisclosureNote",
        "aiSystems",
    ];
    let has_disclosure = disclosure_keys
        .iter()
        .any(|k| frontmatter.contains_key(*k));
    if !has_disclosure {
        return (issues, warnings);
    }

    let digital_source_type = frontmatter
        .get("digitalSourceType")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let has_other = frontmatter.contains_key("euAiLabel")
        || frontmatter.get("aiSystems").and_then(|v| v.as_array()).is_some_and(|a| !a.is_empty())
        || frontmatter
            .get("aiDisclosureNote")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.trim().is_empty());

    if has_other && digital_source_type.is_none() {
        issues.push(OkfValidationFinding {
            is_error: true,
            message: "digitalSourceType is required when other AI disclosure fields are set".to_string(),
            instance_path: Some("/digitalSourceType".to_string()),
        });
    }

    if let Some(dst) = digital_source_type {
        if !resolve_digital_source_type(dst).is_some() {
            let msg = format!("unknown digitalSourceType: {dst}");
            if strict_codes {
                issues.push(OkfValidationFinding {
                    is_error: true,
                    message: msg,
                    instance_path: Some("/digitalSourceType".to_string()),
                });
            } else {
                warnings.push(msg);
            }
        }
    }

    (issues, warnings)
}

fn resolve_digital_source_type(raw: &str) -> Option<String> {
    const PHASE1: &[&str] = &[
        "trainedAlgorithmicMedia",
        "compositeWithTrainedAlgorithmicMedia",
        "compositeSynthetic",
        "algorithmicMedia",
        "humanEdits",
        "digitalCreation",
    ];
    let trimmed = raw.trim();
    let code = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let normalized = trimmed.trim_end_matches('/');
        let prefix = "http://cv.iptc.org/newscodes/digitalsourcetype/";
        let http_uri = normalized.replacen("https://", "http://", 1);
        if !http_uri.starts_with(prefix) {
            return None;
        }
        http_uri[prefix.len()..].to_string()
    } else {
        trimmed.to_string()
    };
    let code = if code == "digitalArt" { "digitalCreation".to_string() } else { code };
    if PHASE1.contains(&code.as_str()) {
        Some(code)
    } else {
        None
    }
}

pub fn validate_okf_source(
    rel_path: &str,
    frontmatter_yaml: &serde_yaml::Mapping,
    body: &str,
    okf: &Option<BackendOkf>,
) -> (Vec<OkfValidationFinding>, Vec<String>) {
    let mut findings = Vec::new();
    let mut warnings = Vec::new();

    let profile_raw = frontmatter_yaml
        .get(serde_yaml::Value::String("profile".into()))
        .and_then(|v| v.as_str());
    if let Some(msg) = validate_profile_format(profile_raw) {
        findings.push(OkfValidationFinding {
            is_error: true,
            message: msg,
            instance_path: None,
        });
    }

    let mut norm_warnings = Vec::new();
    let okf_type = resolve_type(frontmatter_yaml, &mut norm_warnings);
    warnings.extend(norm_warnings);

    let default_profile = okf
        .as_ref()
        .and_then(|o| o.default_profile.as_deref());
    let unknown_type = okf
        .as_ref()
        .and_then(|o| o.unknown_type.as_deref())
        .unwrap_or("warn");
    let profile = resolve_profile_for_validation(profile_raw, default_profile);

    findings.extend(validate_type_for_profile(&okf_type, &profile, unknown_type));

    let has_profile_error = findings.iter().any(|f| f.is_error && f.message.contains("Unsupported profile"));
    if !has_profile_error {
        if let Some(validator) = SCHEMA_CACHE.get(&profile) {
            let title = resolve_title(frontmatter_yaml, body, &slug_from_path(rel_path));
            let fm_for_schema = build_fm_for_schema(frontmatter_yaml, &okf_type, &title, &profile);
            for err in validator.iter_errors(&fm_for_schema) {
                let instance_path = err.instance_path.to_string();
                findings.push(OkfValidationFinding {
                    is_error: true,
                    message: err.to_string(),
                    instance_path: if instance_path.is_empty() {
                        None
                    } else {
                        Some(instance_path)
                    },
                });
            }
        }
    }

    let fm_json = match build_fm_for_schema(frontmatter_yaml, &okf_type, "", &profile) {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    let strict = profile == "sorane-okf/0.2" || profile == "sorane-okf/0.3";
    let (disclosure_issues, disclosure_warnings) = validate_disclosure_fields(&fm_json, strict);
    findings.extend(disclosure_issues);
    warnings.extend(disclosure_warnings);

    (findings, warnings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsupported_type_for_01() {
        let fm: serde_yaml::Mapping = serde_yaml::from_str("type: playbook\ntitle: T\n").unwrap();
        let (findings, _) = validate_okf_source("x.md", &fm, "", &None);
        assert!(findings.iter().any(|f| f.message.contains("未サポートの type")));
    }
}