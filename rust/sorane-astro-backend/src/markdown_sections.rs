use regex::Regex;
use std::sync::LazyLock;

static FENCE_OPEN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(```+|~~~+)").expect("fence re"));
static H2_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^##\s+(.+)$").expect("h2 re"));
static ANCHOR_SUFFIX_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\s*\{#([^}]+)\}\s*$").expect("anchor re"));

#[derive(Debug, Clone)]
pub struct MarkdownSection {
    pub label: String,
    pub anchor_id: Option<String>,
    pub line: usize,
    pub body_markdown: String,
}

#[derive(Debug, Clone)]
pub struct MarkdownSectionSplit {
    pub sections: Vec<MarkdownSection>,
    pub preamble_markdown: String,
    pub preamble_line: Option<usize>,
}

fn parse_heading_label(raw: &str) -> (String, Option<String>) {
    if let Some(cap) = ANCHOR_SUFFIX_RE.captures(raw) {
        let anchor = cap.get(1).map(|m| m.as_str().to_string());
        let end = cap.get(0).map(|m| m.start()).unwrap_or(raw.len());
        return (raw[..end].trim().to_string(), anchor);
    }
    (raw.trim().to_string(), None)
}

fn first_nonempty_line(text: &str) -> Option<usize> {
    for (i, line) in text.lines().enumerate() {
        if !line.trim().is_empty() {
            return Some(i + 1);
        }
    }
    None
}

/// Split markdown body on `##` headings outside fenced code blocks.
pub fn split_markdown_on_h2(body: &str) -> MarkdownSectionSplit {
    let lines: Vec<&str> = body.lines().collect();
    let mut preamble_lines: Vec<&str> = Vec::new();
    let mut sections: Vec<MarkdownSection> = Vec::new();
    let mut current: Option<(String, Option<String>, usize, Vec<&str>)> = None;
    let mut in_fence = false;
    let mut fence_marker = String::new();

    for (i, line) in lines.iter().enumerate() {
        if let Some(m) = FENCE_OPEN_RE.captures(line) {
            let marker = m.get(1).map(|x| x.as_str()).unwrap_or("");
            if !in_fence {
                in_fence = true;
                fence_marker = marker.to_string();
            } else if line.starts_with(&fence_marker) {
                in_fence = false;
                fence_marker.clear();
            }
            if let Some((_, _, _, ref mut body_lines)) = current {
                body_lines.push(line);
            } else {
                preamble_lines.push(line);
            }
            continue;
        }

        if in_fence {
            if let Some((_, _, _, ref mut body_lines)) = current {
                body_lines.push(line);
            } else {
                preamble_lines.push(line);
            }
            continue;
        }

        if let Some(cap) = H2_RE.captures(line) {
            if let Some((label, anchor_id, line_no, body_lines)) = current.take() {
                sections.push(MarkdownSection {
                    label,
                    anchor_id,
                    line: line_no,
                    body_markdown: body_lines.join("\n"),
                });
            }
            let heading_raw = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let (label, anchor_id) = parse_heading_label(heading_raw);
            current = Some((label, anchor_id, i + 1, Vec::new()));
            continue;
        }

        if let Some((_, _, _, ref mut body_lines)) = current {
            body_lines.push(line);
        } else {
            preamble_lines.push(line);
        }
    }

    if let Some((label, anchor_id, line_no, body_lines)) = current {
        sections.push(MarkdownSection {
            label,
            anchor_id,
            line: line_no,
            body_markdown: body_lines.join("\n"),
        });
    }

    let preamble_markdown = preamble_lines.join("\n");
    let preamble_line = first_nonempty_line(&preamble_markdown);

    MarkdownSectionSplit {
        sections,
        preamble_markdown,
        preamble_line,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_h2_with_anchor() {
        let split = split_markdown_on_h2("## Term {#id}\n\nDefinition.\n");
        assert_eq!(split.sections.len(), 1);
        assert_eq!(split.sections[0].label, "Term");
        assert_eq!(split.sections[0].anchor_id.as_deref(), Some("id"));
    }
}