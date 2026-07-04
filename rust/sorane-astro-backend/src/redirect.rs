use serde::Deserialize;

use crate::i18n::{locale_id_from_rel_path, logical_rel_path, DEFAULT_LOCALE_ID, I18nContext};
use crate::safe_url::validate_redirect_target;

const ALLOWED_STATUSES: &[i64] = &[301, 302, 303, 307, 308];

pub struct RedirectFinding {
    pub is_error: bool,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BackendRedirectRule {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub status: Option<i64>,
}

struct RedirectRule {
    from: String,
    to: String,
    status: i64,
}

fn parse_redirect_status_raw(raw: Option<&serde_yaml::Value>) -> i64 {
    match raw {
        Some(serde_yaml::Value::Number(n)) => n.as_i64().unwrap_or(301),
        Some(serde_yaml::Value::String(s)) if s.chars().all(|c| c.is_ascii_digit()) => {
            s.parse().unwrap_or(301)
        }
        _ => 301,
    }
}

fn parse_redirect_status_fm(fm: &serde_yaml::Mapping) -> i64 {
    let raw = fm
        .get(serde_yaml::Value::String("redirect_status".into()))
        .or_else(|| fm.get(serde_yaml::Value::String("redirectStatus".into())));
    parse_redirect_status_raw(raw)
}

fn validate_redirect_status(status: i64) -> Option<String> {
    if ALLOWED_STATUSES.contains(&status) {
        None
    } else {
        Some(format!(
            "redirect status must be one of {}",
            ALLOWED_STATUSES
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ))
    }
}

pub fn normalize_redirect_from(from: &str) -> Result<String, String> {
    let trimmed = from.trim();
    if trimmed.is_empty() {
        return Err("redirect from is empty".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    if trimmed.starts_with('/') {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("/{trimmed}"))
    }
}

fn normalize_redirect_to(to: &str) -> Result<String, String> {
    let trimmed = to.trim();
    if trimmed.is_empty() {
        return Err("redirect to is empty".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    if trimmed.starts_with('/') {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("/{trimmed}"))
    }
}

fn out_rel_for_redirect(rel_path: &str, okf_type: &str, ctx: &I18nContext) -> String {
    let logical = logical_rel_path(rel_path, ctx);
    let slug = logical
        .split('/')
        .next_back()
        .unwrap_or(&logical)
        .trim_end_matches(".mdx")
        .trim_end_matches(".md");
    let base = if okf_type == "index" || slug == "index" {
        "index.html".to_string()
    } else {
        format!("{slug}.html")
    };
    let locale_id = locale_id_from_rel_path(rel_path, ctx);
    if locale_id == DEFAULT_LOCALE_ID {
        base
    } else if let Some(spec) = ctx.locales.get(&locale_id) {
        format!("{}/{}", spec.path_prefix, base)
    } else {
        base
    }
}

pub fn validate_redirect_frontmatter(
    fm: &serde_yaml::Mapping,
    same_origin_base: Option<&str>,
) -> Vec<RedirectFinding> {
    let redirect = fm
        .get(serde_yaml::Value::String("redirect".into()))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let Some(target) = redirect else {
        return Vec::new();
    };
    let mut findings = Vec::new();
    if let Some(message) = validate_redirect_target(target, same_origin_base) {
        findings.push(RedirectFinding {
            is_error: true,
            message,
        });
    }
    if let Some(message) = validate_redirect_status(parse_redirect_status_fm(fm)) {
        findings.push(RedirectFinding {
            is_error: true,
            message,
        });
    }
    findings
}

pub fn validate_redirect_config_rules(
    rules: &[BackendRedirectRule],
    same_origin_base: Option<&str>,
) -> Vec<RedirectFinding> {
    if rules.is_empty() {
        return Vec::new();
    }
    let mut findings = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for (i, rule) in rules.iter().enumerate() {
        let label = format!("build.redirects[{i}]");
        if rule.from.trim().is_empty() {
            findings.push(RedirectFinding {
                is_error: true,
                message: format!("{label}: from is required"),
            });
            continue;
        }
        if rule.to.trim().is_empty() {
            findings.push(RedirectFinding {
                is_error: true,
                message: format!("{label}: to is required"),
            });
            continue;
        }
        match normalize_redirect_from(&rule.from) {
            Ok(from) => {
                if let Some(message) = validate_redirect_target(&rule.to, same_origin_base) {
                    findings.push(RedirectFinding {
                        is_error: true,
                        message: format!("{label}: {message}"),
                    });
                }
                let status = rule.status.unwrap_or(301);
                if let Some(message) = validate_redirect_status(status) {
                    findings.push(RedirectFinding {
                        is_error: true,
                        message: format!("{label}: {message}"),
                    });
                }
                if seen.contains(&from) {
                    findings.push(RedirectFinding {
                        is_error: true,
                        message: format!("duplicate redirect from path: {from}"),
                    });
                } else {
                    seen.insert(from);
                }
            }
            Err(message) => {
                findings.push(RedirectFinding {
                    is_error: true,
                    message: format!("{label}: {message}"),
                });
            }
        }
    }
    findings
}

pub struct RedirectContentEntry {
    pub rel_path: String,
    pub okf_type: String,
    pub redirect_target: Option<String>,
    pub redirect_status: i64,
}

fn collect_all_redirect_rules(
    config_rules: &[BackendRedirectRule],
    content: &[RedirectContentEntry],
    ctx: &I18nContext,
) -> (Vec<RedirectRule>, Vec<String>) {
    let mut combined = Vec::new();
    for rule in config_rules {
        if let (Ok(from), Ok(to)) = (
            normalize_redirect_from(&rule.from),
            normalize_redirect_to(&rule.to),
        ) {
            combined.push(RedirectRule {
                from,
                to,
                status: rule.status.unwrap_or(301),
            });
        }
    }
    for entry in content {
        let Some(target) = entry
            .redirect_target
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        if let Ok(to) = normalize_redirect_to(target) {
            let out_rel = out_rel_for_redirect(&entry.rel_path, &entry.okf_type, ctx);
            if let Ok(from) = normalize_redirect_from(&out_rel) {
                combined.push(RedirectRule {
                    from,
                    to,
                    status: entry.redirect_status,
                });
            }
        }
    }
    let mut seen = std::collections::BTreeMap::new();
    let mut duplicates = Vec::new();
    for rule in combined {
        if seen.contains_key(&rule.from) {
            duplicates.push(rule.from.clone());
        }
        seen.insert(rule.from.clone(), rule);
    }
    (seen.into_values().collect(), duplicates)
}

pub fn validate_redirect_collisions(
    config_rules: &[BackendRedirectRule],
    content: &[RedirectContentEntry],
    ctx: &I18nContext,
) -> Vec<RedirectFinding> {
    let (_, duplicates) = collect_all_redirect_rules(config_rules, content, ctx);
    duplicates
        .into_iter()
        .map(|from| RedirectFinding {
            is_error: true,
            message: format!("duplicate redirect from path: {from}"),
        })
        .collect()
}

pub fn collect_redirect_config_validation(
    config_rules: &[BackendRedirectRule],
    content: &[RedirectContentEntry],
    ctx: &I18nContext,
    same_origin_base: Option<&str>,
) -> Vec<RedirectFinding> {
    let mut findings = validate_redirect_config_rules(config_rules, same_origin_base);
    findings.extend(validate_redirect_collisions(config_rules, content, ctx));
    findings
}