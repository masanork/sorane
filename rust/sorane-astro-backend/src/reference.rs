use regex::Regex;
use std::sync::LazyLock;

static FENCE_OPEN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(```+|~~~+)").expect("fence re"));
static GFM_TABLE_ROW_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\|.+\|$").expect("table row"));
static GFM_TABLE_SEP_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\|[-:| ]+\|$").expect("table sep"));

pub fn body_has_gfm_table(body: &str) -> bool {
    let lines: Vec<&str> = body.lines().collect();
    let mut in_fence = false;
    let mut fence_marker = String::new();
    for i in 0..lines.len().saturating_sub(1) {
        let line = lines[i];
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
        let a = line.trim();
        let b = lines[i + 1].trim();
        if GFM_TABLE_ROW_RE.is_match(a) && GFM_TABLE_SEP_RE.is_match(b) {
            return true;
        }
    }
    false
}

pub fn validate_reference_warnings(body: &str, fm: &serde_yaml::Mapping) -> Vec<String> {
    let mut warnings = Vec::new();
    let description = fm
        .get(serde_yaml::Value::String("description".into()))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");
    let resource = fm
        .get(serde_yaml::Value::String("resource".into()))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");

    if description.is_empty() {
        warnings.push("reference: missing description (recommended for spec pages)".to_string());
    }
    if resource.is_empty() {
        warnings.push("reference: missing resource URI (recommended for source link)".to_string());
    }
    if body.trim().is_empty() {
        warnings.push("reference: empty body; add tables or field definitions".to_string());
    } else if !body_has_gfm_table(body) {
        warnings.push(
            "reference: body has no GFM table; code lists and field enums often use tables"
                .to_string(),
        );
    }

    let identifier = fm
        .get(serde_yaml::Value::String("identifier".into()))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    if let Some(identifier) = identifier {
        if !resource.is_empty() && identifier == resource {
            warnings.push(
                "reference: identifier matches resource; use identifier for this page and resource for the external source".to_string(),
            );
        }
    }

    warnings
}