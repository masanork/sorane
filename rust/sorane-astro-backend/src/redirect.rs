use crate::safe_url::validate_redirect_target;

const ALLOWED_STATUSES: &[i64] = &[301, 302, 303, 307, 308];

pub struct RedirectFinding {
    pub is_error: bool,
    pub message: String,
}

fn parse_redirect_status(fm: &serde_yaml::Mapping) -> i64 {
    let raw = fm
        .get(serde_yaml::Value::String("redirect_status".into()))
        .or_else(|| fm.get(serde_yaml::Value::String("redirectStatus".into())));
    match raw {
        Some(serde_yaml::Value::Number(n)) => n.as_i64().unwrap_or(301),
        Some(serde_yaml::Value::String(s)) if s.chars().all(|c| c.is_ascii_digit()) => {
            s.parse().unwrap_or(301)
        }
        _ => 301,
    }
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
    if let Some(message) = validate_redirect_status(parse_redirect_status(fm)) {
        findings.push(RedirectFinding {
            is_error: true,
            message,
        });
    }
    findings
}