use regex::Regex;
use std::sync::LazyLock;

use crate::markdown_sections::split_markdown_on_h2;

static FENCE_OPEN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(```+|~~~+)").expect("fence re"));
static HEADING_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(#{1,6})\s+").expect("heading re"));

fn find_heading_lines_outside_fences(body: &str, depth: usize) -> Vec<usize> {
    let re = Regex::new(&format!(r"^#{{{depth}}}\s+")).expect("depth heading re");
    let mut out = Vec::new();
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
        if re.is_match(line) {
            out.push(i + 1);
        }
    }
    out
}

pub fn validate_faq_warnings(body: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    let split = split_markdown_on_h2(body);

    if split.sections.is_empty() {
        warnings.push("faq: no ## question headings found; use ## for each question".to_string());
        let h3_lines = find_heading_lines_outside_fences(body, 3);
        if !h3_lines.is_empty() {
            warnings.push(format!(
                "faq: found ### headings (lines {}); use ## for each question",
                h3_lines
                    .iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        return warnings;
    }

    if !split.preamble_markdown.trim().is_empty() {
        if let Some(line) = split.preamble_line {
            warnings.push(format!(
                "faq: content before first question (line {line}); start body with ##"
            ));
        }
    }

    for section in &split.sections {
        if section.body_markdown.trim().is_empty() {
            warnings.push(format!(
                "faq: empty answer for \"{}\" (line {})",
                section.label, section.line
            ));
        }
    }

    let mut in_fence = false;
    let mut fence_marker = String::new();
    let mut seen_question = false;
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
        let Some(cap) = HEADING_RE.captures(line) else {
            continue;
        };
        let level = cap.get(1).map(|m| m.as_str().len()).unwrap_or(0);
        if level == 2 {
            seen_question = true;
            continue;
        }
        if !seen_question {
            warnings.push(format!(
                "faq: use ## for questions; first heading is h{level} (line {})",
                i + 1
            ));
        } else if level == 1 {
            warnings.push(format!(
                "faq: h1 in body (line {}); use ## for questions",
                i + 1
            ));
        }
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_questions_warns() {
        let warnings = validate_faq_warnings("Just text.\n");
        assert!(warnings.iter().any(|w| w.contains("no ## question")));
    }
}