use regex::Regex;
use std::sync::LazyLock;

static BLOCKED_SCHEMES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?i)(javascript|data|vbscript|file):").expect("blocked"));
static DANGEROUS_SCHEME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-z][a-z0-9+.-]*:").expect("dangerous"));
static ORIGIN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(https?://[^/]+)").expect("origin re"));

fn starts_with_ci(s: &str, prefix: &str) -> bool {
    s.len() >= prefix.len() && s.as_bytes()[..prefix.len()].eq_ignore_ascii_case(prefix.as_bytes())
}

/// Mirrors TS `SAFE_SCHEME` without look-ahead (Rust `regex` does not support it).
fn is_safe_scheme_url(trimmed: &str) -> bool {
    if starts_with_ci(trimmed, "http://") || starts_with_ci(trimmed, "https://") {
        return true;
    }
    if starts_with_ci(trimmed, "mailto:") || starts_with_ci(trimmed, "tel:") {
        return true;
    }
    if trimmed.starts_with('#') {
        return true;
    }
    if trimmed.starts_with('/') && !trimmed.starts_with("//") {
        return true;
    }
    trimmed.starts_with('.') && !trimmed.starts_with("..")
}

pub fn unsafe_url_reason(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("//") {
        return Some("protocol-relative URLs are not allowed".to_string());
    }
    if BLOCKED_SCHEMES.is_match(trimmed) {
        return Some("blocked URL scheme".to_string());
    }
    if !is_safe_scheme_url(trimmed) && DANGEROUS_SCHEME.is_match(trimmed) {
        return Some("unsupported URL scheme".to_string());
    }
    None
}

pub fn validate_link_href(url: &str) -> Option<String> {
    unsafe_url_reason(url)
        .map(|reason| format!("unsafe link URL ({reason}): {url}"))
}

fn origin_of(url: &str) -> Option<String> {
    ORIGIN_RE.captures(url).and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

pub fn is_same_origin_url(target: &str, base_url: &str) -> bool {
    let trimmed = target.trim();
    if trimmed.starts_with('/') && !trimmed.starts_with("//") {
        return true;
    }
    match (origin_of(trimmed), origin_of(base_url)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

pub fn validate_redirect_target(to: &str, same_origin_base: Option<&str>) -> Option<String> {
    let trimmed = to.trim();
    if trimmed.is_empty() {
        return Some("redirect target is empty".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if unsafe_url_reason(trimmed).is_some() {
            return Some(format!("redirect target uses unsafe URL: {trimmed}"));
        }
        if let Some(base) = same_origin_base.filter(|b| !b.is_empty()) {
            if !is_same_origin_url(trimmed, base) {
                if let Some(origin) = origin_of(base) {
                    return Some(format!("redirect target must stay on {origin}"));
                }
            }
        }
        return None;
    }
    if trimmed.starts_with('/') && !trimmed.starts_with("//") {
        return None;
    }
    if trimmed.starts_with("//") {
        return Some("protocol-relative redirect targets are not allowed".to_string());
    }
    Some("redirect target must be an absolute URL (http/https) or a path starting with /".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_image_paths_are_safe() {
        assert!(unsafe_url_reason("photo.png").is_none());
        assert!(unsafe_url_reason("/assets/x.png").is_none());
        assert!(unsafe_url_reason("./x.png").is_none());
    }

    #[test]
    fn protocol_relative_is_unsafe() {
        assert!(unsafe_url_reason("//evil.example").is_some());
    }
}