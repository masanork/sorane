use serde::Deserialize;
use serde_json::Value;

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

pub fn validate_okf_type(type_value: Option<&str>, profile: Option<&str>) -> Option<String> {
    let Some(type_value) = type_value else {
        return Some("OKF 必須フィールド `type` がありません".to_string());
    };
    if type_value.is_empty() {
        return Some("OKF 必須フィールド `type` がありません".to_string());
    }
    if profile == Some("sorane-okf/0.3") {
        return None;
    }
    if type_value == "article" || type_value == "index" {
        return None;
    }
    let profile_label = profile.unwrap_or("sorane-okf/0.1");
    Some(format!(
        "未サポートの type: {type_value}（{profile_label} は article / index のみ）"
    ))
}

pub fn collect_file_validation(
    rel_path: &str,
    frontmatter: Option<&str>,
    body: &str,
    quality: &Option<BackendQuality>,
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

    let fm_map = fm_yaml.as_mapping();
    let okf_type = fm_map
        .and_then(|m| m.get(serde_yaml::Value::String("type".into())))
        .and_then(|v| v.as_str());
    let profile = fm_map
        .and_then(|m| m.get(serde_yaml::Value::String("profile".into())))
        .and_then(|v| v.as_str());

    if let Some(message) = validate_okf_type(okf_type, profile) {
        errors += 1;
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