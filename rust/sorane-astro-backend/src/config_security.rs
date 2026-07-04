use serde::Deserialize;

use crate::diagram::BackendDiagrams;
use crate::safe_url::validate_http_nav_url;

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendEmergencyLocale {
    pub message: Option<String>,
    pub href: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendEmergency {
    pub message: Option<String>,
    pub href: Option<String>,
    #[serde(default)]
    pub locales: std::collections::BTreeMap<String, BackendEmergencyLocale>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendImageMetadata {
    pub exiftool: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendC2pa {
    pub binary: Option<String>,
}

pub struct ConfigSecurityFinding {
    pub is_error: bool,
    pub message: String,
}

fn basename_only(path: &str) -> String {
    let trimmed = path.trim();
    let slash = trimmed.rfind('/').or_else(|| trimmed.rfind('\\'));
    slash
        .map(|i| trimmed[i + 1..].to_string())
        .unwrap_or_else(|| trimmed.to_string())
}

fn validate_binary_field(label: &str, value: Option<&str>, allowed: &[&str]) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    let base = basename_only(value);
    if base.contains('/') || base.contains('\\') || base.contains("..") {
        return Some(format!("{label} must be a bare executable name, got {value}"));
    }
    if !allowed.contains(&base.as_str()) {
        return Some(format!(
            "{label} must be one of {}, got {value}",
            allowed.join(", ")
        ));
    }
    None
}

pub fn validate_emergency_banner_urls(emergency: &Option<BackendEmergency>) -> Vec<ConfigSecurityFinding> {
    let Some(raw) = emergency else {
        return Vec::new();
    };
    let mut findings = Vec::new();
    let mut specs: Vec<Option<&str>> = vec![raw.href.as_deref()];
    for locale in raw.locales.values() {
        specs.push(locale.href.as_deref());
    }
    for href in specs.into_iter().flatten() {
        if let Some(err) = validate_http_nav_url(href) {
            findings.push(ConfigSecurityFinding {
                is_error: true,
                message: format!("emergency banner href {err}"),
            });
        }
    }
    findings
}

pub fn validate_config_security(
    allow_custom_binaries: bool,
    diagrams: &Option<BackendDiagrams>,
    image_metadata: &Option<BackendImageMetadata>,
    c2pa: &Option<BackendC2pa>,
) -> Vec<ConfigSecurityFinding> {
    if allow_custom_binaries {
        return Vec::new();
    }
    let mut findings = Vec::new();
    let checks: [(&str, Option<&str>, &[&str]); 5] = [
        (
            "build.diagrams.d2.binary",
            diagrams
                .as_ref()
                .and_then(|d| d.d2.as_ref())
                .and_then(|d| d.binary.as_deref()),
            &["d2"],
        ),
        (
            "build.diagrams.graphviz.binary",
            diagrams
                .as_ref()
                .and_then(|d| d.graphviz.as_ref())
                .and_then(|g| g.binary.as_deref()),
            &["dot"],
        ),
        (
            "build.diagrams.mermaid.mmdc",
            diagrams
                .as_ref()
                .and_then(|d| d.mermaid.as_ref())
                .and_then(|m| m.mmdc.as_deref()),
            &["mmdc"],
        ),
        (
            "build.image_metadata.exiftool",
            image_metadata.as_ref().and_then(|m| m.exiftool.as_deref()),
            &["exiftool"],
        ),
        (
            "build.c2pa.binary",
            c2pa.as_ref().and_then(|c| c.binary.as_deref()),
            &["c2patool"],
        ),
    ];
    // mmdc field - add to BackendMermaidConfig
    for (label, value, allowed) in checks {
        if let Some(message) = validate_binary_field(label, value, allowed) {
            findings.push(ConfigSecurityFinding {
                is_error: true,
                message,
            });
        }
    }
    findings
}