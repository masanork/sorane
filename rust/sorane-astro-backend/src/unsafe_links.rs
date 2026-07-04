use regex::Regex;
use std::sync::LazyLock;

use crate::safe_url::validate_link_href;

static MD_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]*)\]\(([^)]+)\)").expect("md link"));
static MD_IMAGE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").expect("md image"));
static HTML_HREF_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)\bhref\s*=\s*("([^"]*)"|'([^']*)')"#).expect("href"));
static HTML_SRC_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)\bsrc\s*=\s*("([^"]*)"|'([^']*)')"#).expect("src"));
static RAW_EMBED_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<(iframe|embed|object|script)\b").expect("embed"));

pub struct UnsafeLinkFinding {
    pub message: String,
}

pub fn validate_unsafe_link_warnings(body: &str, strict_html: bool, allow_embeds: bool) -> Vec<UnsafeLinkFinding> {
    let mut findings = Vec::new();
    for (i, line) in body.lines().enumerate() {
        let line_no = i + 1;
        for cap in MD_IMAGE_RE.captures_iter(line).chain(MD_LINK_RE.captures_iter(line)) {
            let href = cap.get(2).map(|m| m.as_str().trim()).unwrap_or("");
            if href.is_empty() || href.starts_with('#') {
                continue;
            }
            if let Some(err) = validate_link_href(href) {
                findings.push(UnsafeLinkFinding {
                    message: format!("{err} (line {line_no})"),
                });
            }
        }
    }

    if RAW_EMBED_RE.is_match(body) && (strict_html || !allow_embeds) {
        findings.push(UnsafeLinkFinding {
            message: "raw HTML contains iframe/embed/object/script; use strict import or remove embeds".to_string(),
        });
    }

    for (i, line) in body.lines().enumerate() {
        let line_no = i + 1;
        for re in [&*HTML_HREF_RE, &*HTML_SRC_RE] {
            for cap in re.captures_iter(line) {
                let href = cap
                    .get(2)
                    .or_else(|| cap.get(3))
                    .map(|m| m.as_str().trim())
                    .unwrap_or("");
                if href.is_empty() || href.starts_with('#') {
                    continue;
                }
                if let Some(err) = validate_link_href(href) {
                    findings.push(UnsafeLinkFinding {
                        message: format!("{err} (line {line_no})"),
                    });
                }
            }
        }
    }

    findings
}