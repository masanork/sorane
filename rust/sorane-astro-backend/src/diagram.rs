use regex::Regex;
use serde::Deserialize;
use std::sync::LazyLock;

static FENCE_OPEN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(`{3,}|~{3,})(\S*)\s*(.*)$").expect("fence open re"));
static ALT_DOUBLE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\balt="((?:[^"\\]|\\.)*)""#).expect("alt double re"));
static ALT_SINGLE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\balt='((?:[^'\\]|\\.)*)'"#).expect("alt single re"));
static ALT_COMMENT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*%%\s*alt\s*:\s*(.+?)\s*$").expect("alt comment re"));

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendMermaidConfig {
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub mmdc: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendD2Config {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub binary: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendGraphvizConfig {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub binary: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendDiagrams {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub mermaid: Option<BackendMermaidConfig>,
    #[serde(default)]
    pub d2: Option<BackendD2Config>,
    #[serde(default)]
    pub graphviz: Option<BackendGraphvizConfig>,
}

fn is_graphviz_lang(lang: &str) -> bool {
    matches!(
        lang,
        "dot" | "graphviz" | "neato" | "fdp" | "circo" | "twopi" | "osage" | "patchwork"
    )
}

fn is_diagram_lang_active(lang: &str, config: &BackendDiagrams) -> bool {
    if config.enabled == Some(false) {
        return false;
    }
    if lang == "mermaid" {
        return config.mermaid.as_ref().and_then(|m| m.mode.as_deref()) != Some("off");
    }
    if lang == "d2" {
        return config.d2.as_ref().and_then(|d| d.enabled) == Some(true);
    }
    if is_graphviz_lang(lang) {
        return config.graphviz.as_ref().and_then(|g| g.enabled) == Some(true);
    }
    false
}

fn parse_alt_from_meta(meta: &str) -> Option<String> {
    let cap = ALT_DOUBLE_RE
        .captures(meta)
        .or_else(|| ALT_SINGLE_RE.captures(meta))?;
    let value = cap.get(1)?.as_str();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn parse_alt_comment(source: &str) -> Option<String> {
    let value = ALT_COMMENT_RE.captures(source)?.get(1)?.as_str().trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn extract_alt_text(meta: &str, source: &str) -> Option<String> {
    parse_alt_from_meta(meta).or_else(|| parse_alt_comment(source))
}

/// Default sorane diagrams config: enabled=false (matches `DEFAULT_DIAGRAMS_CONFIG`).
pub fn validate_diagram_alt_warnings(body: &str, config: &Option<BackendDiagrams>) -> Vec<String> {
    let config = config.as_ref().cloned().unwrap_or_default();
    if config.enabled != Some(true) {
        return Vec::new();
    }
    let mut warnings = Vec::new();
    let lines: Vec<&str> = body.lines().collect();
    let mut i = 0usize;
    while i < lines.len() {
        let Some(cap) = FENCE_OPEN_RE.captures(lines[i]) else {
            i += 1;
            continue;
        };
        let marker = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let lang = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        let meta = cap.get(3).map(|m| m.as_str()).unwrap_or("");
        let close = marker.chars().next().unwrap_or('`');
        let min_len = marker.len();
        let mut block = Vec::new();
        i += 1;
        while i < lines.len() {
            let line = lines[i];
            if line.len() >= min_len
                && line.starts_with(&close.to_string().repeat(min_len))
                && (line.len() == min_len || line[min_len..].trim().is_empty())
            {
                break;
            }
            block.push(line);
            i += 1;
        }
        i += 1;
        if !is_diagram_lang_active(lang, &config) {
            continue;
        }
        if extract_alt_text(meta, &block.join("\n")).is_some() {
            continue;
        }
        warnings.push(format!(
            "diagram ({lang}) has no alt text; add alt=\"...\" to the fence info string or a %% alt: comment"
        ));
    }
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_skips_diagram_warnings() {
        let body = "```mermaid\nflowchart LR\nA-->B\n```";
        assert!(validate_diagram_alt_warnings(body, &None).is_empty());
    }

    #[test]
    fn enabled_config_warns_without_alt() {
        let body = "```mermaid\nflowchart LR\nA-->B\n```";
        let config = BackendDiagrams {
            enabled: Some(true),
            ..Default::default()
        };
        let warnings = validate_diagram_alt_warnings(body, &Some(config));
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("mermaid"));
    }
}