use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

use crate::validate::BackendQuality;

static IMAGE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").expect("image re"));
static LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").expect("link re"));
static FENCE_OPEN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(```+|~~~+)").expect("fence re"));
static INLINE_CODE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"`+[^`]*`+").expect("inline code re"));
static SEPARATOR_CELL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^:?-{3,}:?$").expect("separator cell re"));

fn gate_enabled(quality: &Option<BackendQuality>, key: &str) -> bool {
    let Some(q) = quality else {
        return true;
    };
    let value = match key {
        "image_alt" => q.image_alt.as_ref(),
        "link_text" => q.link_text.as_ref(),
        "table_headers" => q.table_headers.as_ref(),
        "dates" => q.dates.as_ref(),
        _ => None,
    };
    !matches!(value, Some(Value::Bool(false)))
}

fn is_generic_link_text(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    if let Some(cap) = Regex::new(r"^`([^`]+)`$").ok().and_then(|re| re.captures(t)) {
        if !cap.get(1).map(|m| m.as_str().trim()).unwrap_or("").is_empty() {
            return false;
        }
    }
    const GENERIC: &[&str] = &[
        "こちら",
        "こちらをクリック",
        "ここ",
        "リンク",
        "詳細",
        "詳細はこちら",
        "こちらから",
        "here",
        "click here",
        "click",
        "link",
        "read more",
        "more",
        "this",
    ];
    if GENERIC.contains(&t) {
        return true;
    }
    let lower = t.to_lowercase();
    GENERIC.iter().any(|g| g.to_lowercase() == lower)
}

fn parse_table_cells(line: &str) -> Vec<String> {
    let trimmed = line.trim();
    if !trimmed.contains('|') {
        return Vec::new();
    }
    let inner = trimmed.trim_start_matches('|').trim_end_matches('|');
    inner.split('|').map(|c| c.trim().to_string()).collect()
}

fn is_table_row(line: &str) -> bool {
    parse_table_cells(line).len() >= 2
}

fn is_separator_row(line: &str) -> bool {
    let cells = parse_table_cells(line);
    cells.len() >= 2 && cells.iter().all(|c| SEPARATOR_CELL_RE.is_match(c))
}

fn strip_inline_code(line: &str) -> String {
    INLINE_CODE_RE
        .replace_all(line, |caps: &regex::Captures| " ".repeat(caps[0].len()))
        .to_string()
}

struct BodyLineIter<'a> {
    lines: std::str::Lines<'a>,
    in_fence: bool,
    fence_marker: String,
    line_no: usize,
}

impl<'a> BodyLineIter<'a> {
    fn new(body: &'a str) -> Self {
        Self {
            lines: body.lines(),
            in_fence: false,
            fence_marker: String::new(),
            line_no: 0,
        }
    }
}

impl<'a> Iterator for BodyLineIter<'a> {
    type Item = (&'a str, usize);

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let line = self.lines.next()?;
            self.line_no += 1;
            if let Some(m) = FENCE_OPEN_RE.captures(line) {
                let marker = m.get(1).map(|x| x.as_str()).unwrap_or("");
                if !self.in_fence {
                    self.in_fence = true;
                    self.fence_marker = marker.to_string();
                } else if line.starts_with(&self.fence_marker) {
                    self.in_fence = false;
                    self.fence_marker.clear();
                }
                continue;
            }
            if self.in_fence {
                continue;
            }
            return Some((line, self.line_no));
        }
    }
}

pub fn validate_image_alt_warnings(body: &str, quality: &Option<BackendQuality>) -> Vec<String> {
    if !gate_enabled(quality, "image_alt") {
        return Vec::new();
    }
    let mut warnings = Vec::new();
    for (line, line_no) in BodyLineIter::new(body) {
        let scan = strip_inline_code(line);
        for cap in IMAGE_RE.captures_iter(&scan) {
            let alt = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if alt.trim().is_empty() {
                warnings.push(format!(
                    "image missing alt text (line {line_no}); use ![description](path)"
                ));
            }
        }
    }
    warnings
}

pub fn validate_link_text_warnings(body: &str, quality: &Option<BackendQuality>) -> Vec<String> {
    if !gate_enabled(quality, "link_text") {
        return Vec::new();
    }
    let mut warnings = Vec::new();
    for (line, line_no) in BodyLineIter::new(body) {
        for cap in LINK_RE.captures_iter(line) {
            let full = cap.get(0).map(|m| m.as_str()).unwrap_or("");
            if full.starts_with('!') {
                continue;
            }
            let text = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let href = cap.get(2).map(|m| m.as_str()).unwrap_or("");
            if href.starts_with('#') {
                continue;
            }
            if is_generic_link_text(text) {
                warnings.push(format!(
                    "non-descriptive link text \"{}\" (line {line_no}); prefer meaningful anchor text",
                    text.trim()
                ));
            }
        }
    }
    warnings
}

pub fn validate_table_warnings(body: &str, quality: &Option<BackendQuality>) -> Vec<String> {
    if !gate_enabled(quality, "table_headers") {
        return Vec::new();
    }
    let mut warnings = Vec::new();
    let lines: Vec<&str> = body.lines().collect();
    let mut in_fence = false;
    let mut fence_marker = String::new();
    let mut i = 0usize;
    while i < lines.len() {
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
            i += 1;
            continue;
        }
        if in_fence {
            i += 1;
            continue;
        }
        if !is_table_row(line) || is_separator_row(line) {
            i += 1;
            continue;
        }
        let line_no = i + 1;
        let header_cells = parse_table_cells(line);
        let next = lines.get(i + 1).copied();
        if !next.is_some_and(is_separator_row) {
            warnings.push(format!(
                "table missing header separator row (line {line_no}); add | --- | after header"
            ));
            i += 1;
            continue;
        }
        for (c, cell) in header_cells.iter().enumerate() {
            if cell.is_empty() {
                warnings.push(format!(
                    "table header cell {} is empty (line {line_no})",
                    c + 1
                ));
            }
        }
        i += 1;
        while i + 1 < lines.len() && is_table_row(lines[i + 1]) && !is_separator_row(lines[i + 1]) {
            i += 1;
        }
        i += 1;
    }
    warnings
}

fn normalize_date(value: Option<&str>) -> Option<String> {
    let value = value?;
    if value.len() < 10 {
        return None;
    }
    let d = &value[..10];
    if regex::Regex::new(r"^\d{4}-\d{2}-\d{2}$").ok()?.is_match(d) {
        Some(d.to_string())
    } else {
        None
    }
}

pub fn validate_date_warnings(
    frontmatter: &serde_yaml::Mapping,
    quality: &Option<BackendQuality>,
) -> Vec<String> {
    if !gate_enabled(quality, "dates") {
        return Vec::new();
    }
    let mut warnings = Vec::new();
    let ts = frontmatter
        .get(serde_yaml::Value::String("timestamp".into()))
        .and_then(|v| v.as_str());
    let up = frontmatter
        .get(serde_yaml::Value::String("updated".into()))
        .and_then(|v| v.as_str());

    if let Some(ts) = ts {
        if normalize_date(Some(ts)).is_none() {
            warnings.push(format!(
                "timestamp \"{ts}\" is not a valid date (use YYYY-MM-DD or ISO 8601)"
            ));
        }
    }
    if let Some(up) = up {
        if normalize_date(Some(up)).is_none() {
            warnings.push(format!(
                "updated \"{up}\" is not a valid date (use YYYY-MM-DD or ISO 8601)"
            ));
        }
    }
    if let (Some(ts_norm), Some(up_norm)) = (normalize_date(ts), normalize_date(up)) {
        if up_norm < ts_norm {
            warnings.push(format!(
                "updated ({up_norm}) is before timestamp ({ts_norm})"
            ));
        }
    }
    warnings
}

pub fn validate_content_quality_warnings(
    body: &str,
    frontmatter: &serde_yaml::Mapping,
    quality: &Option<BackendQuality>,
) -> Vec<String> {
    let mut warnings = validate_image_alt_warnings(body, quality);
    warnings.extend(validate_link_text_warnings(body, quality));
    warnings.extend(validate_table_warnings(body, quality));
    warnings.extend(validate_date_warnings(frontmatter, quality));
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_alt_warning() {
        let warnings = validate_image_alt_warnings("![](x.png)", &None);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("image missing alt"));
    }
}