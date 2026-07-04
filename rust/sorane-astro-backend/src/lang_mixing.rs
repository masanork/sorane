use regex::Regex;
use std::sync::LazyLock;

use crate::validate::BackendQuality;

static FENCE_OPEN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(```+|~~~+)").expect("fence re"));
static HTML_TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>").expect("html tag"));
static LANG_ATTR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)\blang\s*=\s*["']([^"']+)["']"#).expect("lang attr"));
static CJK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u{3040}-\u{30ff}\u{3400}-\u{9fff}\u{f900}-\u{faff}]").expect("cjk")
});
static LATIN_WORD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[A-Za-z]{4,}").expect("latin"));
static BCP47_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$").expect("bcp47")
});

fn gate_enabled(quality: &Option<BackendQuality>) -> bool {
    match quality.as_ref().and_then(|q| q.lang_mixing.as_ref()) {
        Some(serde_json::Value::Bool(false)) => false,
        _ => true,
    }
}

pub fn validate_lang_mixing_warnings(
    body: &str,
    page_lang: &str,
    quality: &Option<BackendQuality>,
) -> Vec<String> {
    if !gate_enabled(quality) {
        return Vec::new();
    }
    let mut warnings = Vec::new();
    let primary_ja = page_lang.starts_with("ja");
    let mut in_fence = false;
    let mut fence_marker = String::new();

    for (i, line) in body.lines().enumerate() {
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
        let line_no = i + 1;

        for cap in HTML_TAG_RE.captures_iter(line) {
            let attrs = cap.get(2).map(|m| m.as_str()).unwrap_or("");
            if let Some(lang_cap) = LANG_ATTR_RE.captures(attrs) {
                let tag = lang_cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
                if !BCP47_RE.is_match(tag) {
                    let element = cap.get(1).map(|m| m.as_str()).unwrap_or("tag");
                    warnings.push(format!(
                        "lang: invalid lang=\"{tag}\" on <{element}> (line {line_no}); use a BCP 47 tag (e.g. en, en-US)"
                    ));
                }
            }
        }

        if line.contains("lang=") || line.contains("<lang") {
            continue;
        }

        let has_cjk = CJK_RE.is_match(line);
        let has_latin = LATIN_WORD_RE.is_match(line);
        if !has_cjk || !has_latin {
            continue;
        }

        if primary_ja {
            warnings.push(format!(
                "lang: mixed Japanese and Latin script without lang markup (line {line_no}); wrap foreign text in <span lang=\"en\">…</span>"
            ));
        } else if page_lang.starts_with("en") && has_cjk {
            warnings.push(format!(
                "lang: mixed English and CJK script without lang markup (line {line_no}); wrap non-English text in <span lang=\"ja\">…</span>"
            ));
        }
    }

    warnings
}