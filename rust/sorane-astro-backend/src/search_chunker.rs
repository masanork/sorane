use crate::heading_slug::SlugLedger;
use crate::markdown_sections::split_markdown_on_h2;
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use regex::Regex;
use serde_yaml::Value;
use std::collections::BTreeMap;
use std::sync::LazyLock;

pub const MIN_BODY: usize = 50;
pub const MIN_BODY_STRUCTURED: usize = 12;
pub const MAX_BODY: usize = 800;

static TAG_SLUG_STRIP_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^\w぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ-]").expect("tag slug re"));

const STRUCTURED_DOC_TYPES: &[&str] = &["faq", "glossary"];

#[derive(Debug, Clone)]
pub struct SearchChunk {
    pub source: String,
    pub chunk_index: usize,
    pub text: String,
    pub heading_path: String,
    pub heading_slug: String,
    pub doc_type: String,
    pub title: String,
    pub timestamp: String,
    pub tags: String,
}

#[derive(Debug, Clone)]
struct DocMeta {
    doc_type: String,
    title: String,
    timestamp: String,
    tags: String,
    skip: bool,
}

#[derive(Debug, Clone)]
struct BodyChunk {
    text: String,
    path: String,
    slug: String,
}

fn slugify_token(value: &str) -> String {
    value.trim().to_lowercase().split_whitespace().collect::<Vec<_>>().join("-")
}

fn slugify_tag(tag: &str) -> String {
    let mut out = tag.trim().to_lowercase();
    out = out.split_whitespace().collect::<Vec<_>>().join("-");
    out = TAG_SLUG_STRIP_RE.replace_all(&out, "").to_string();
    while out.contains("--") {
        out = out.replace("--", "-");
    }
    out.trim_matches('-').to_string()
}

fn yaml_str(map: &BTreeMap<String, Value>, key: &str) -> Option<String> {
    map.get(key).and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    })
}

fn read_meta(frontmatter: Option<&str>) -> (DocMeta, BTreeMap<String, Value>) {
    let fm: BTreeMap<String, Value> = frontmatter
        .and_then(|raw| serde_yaml::from_str(raw).ok())
        .unwrap_or_default();
    let doc_type = yaml_str(&fm, "type").unwrap_or_default();
    let title = yaml_str(&fm, "title").unwrap_or_default();
    let timestamp = yaml_str(&fm, "timestamp").unwrap_or_default();
    let skip = fm.get("isSystem").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut tag_slugs = Vec::new();
    if let Some(Value::Sequence(seq)) = fm.get("tags") {
        for item in seq {
            if let Some(s) = item.as_str() {
                let slug = slugify_tag(s);
                if !slug.is_empty() {
                    tag_slugs.push(slug);
                }
            }
        }
    } else if let Some(Value::String(s)) = fm.get("tags") {
        let slug = slugify_tag(s);
        if !slug.is_empty() {
            tag_slugs.push(slug);
        }
    }
    let mut tags = tag_slugs.join(",");

    if doc_type == "dataset" {
        let mut extra = Vec::new();
        if let Some(license) = yaml_str(&fm, "license") {
            if !license.is_empty() {
                extra.push(format!("license:{}", slugify_token(&license)));
            }
        }
        if let Some(theme) = yaml_str(&fm, "theme") {
            if !theme.is_empty() {
                extra.push(format!("theme:{}", slugify_token(&theme)));
            }
        }
        if let Some(Value::Sequence(dists)) = fm.get("distributions") {
            for item in dists {
                if let Value::Mapping(map) = item {
                    if let Some(Value::String(format)) = map.get(Value::String("format".into())) {
                        if !format.is_empty() {
                            extra.push(format!("format:{}", slugify_token(format)));
                        }
                    }
                }
            }
        }
        if !extra.is_empty() {
            tags = if tags.is_empty() {
                extra.join(",")
            } else {
                format!("{tags},{}", extra.join(","))
            };
        }
    }

    (
        DocMeta {
            doc_type,
            title,
            timestamp,
            tags,
            skip,
        },
        fm,
    )
}

fn split_source(source: &str) -> (Option<&str>, &str) {
    if let Some((fm, body)) = crate::validate::extract_frontmatter_for_validation(source) {
        return (Some(fm), body);
    }
    (None, source)
}

fn is_not_found_path(rel_path: &str) -> bool {
    let normalized = rel_path.replace('\\', "/");
    let base = normalized.rsplit('/').next().unwrap_or(rel_path);
    base.trim_end_matches(".md").eq_ignore_ascii_case("404")
}

fn split_oversized(body: &str) -> Vec<String> {
    if body.len() <= MAX_BODY {
        return vec![body.to_string()];
    }
    let mut parts: Vec<String> = Vec::new();
    for para in body.split("\n\n") {
        let p = para.trim();
        if p.is_empty() {
            continue;
        }
        if let Some(last) = parts.last_mut() {
            if last.len() + p.len() + 2 <= MAX_BODY {
                last.push_str("\n\n");
                last.push_str(p);
                continue;
            }
        }
        parts.push(p.to_string());
    }
    if parts.is_empty() {
        vec![body.to_string()]
    } else {
        parts
    }
}

fn node_text(events: &[Event<'_>], start: usize, end: usize) -> String {
    let mut out = String::new();
    for ev in &events[start..end] {
        match ev {
            Event::Text(t) | Event::Code(t) => out.push_str(t),
            Event::SoftBreak | Event::HardBreak => out.push('\n'),
            _ => {}
        }
    }
    out
}

fn block_to_text(events: &[Event<'_>], start: usize, end: usize) -> String {
    let mut i = start;
    let mut parts: Vec<String> = Vec::new();
    while i < end {
        match &events[i] {
            Event::Start(Tag::Paragraph) | Event::Start(Tag::Heading { .. }) => {
                if let Some(close) = find_tag_end(events, i) {
                    parts.push(node_text(events, i + 1, close).trim().to_string());
                    i = close + 1;
                    continue;
                }
            }
            Event::Start(Tag::BlockQuote(_)) => {
                if let Some(close) = find_tag_end(events, i) {
                    parts.push(node_text(events, i + 1, close).trim().to_string());
                    i = close + 1;
                    continue;
                }
            }
            Event::Start(Tag::List(_)) => {
                if let Some(close) = find_tag_end(events, i) {
                    let mut items = Vec::new();
                    let mut j = i + 1;
                    while j < close {
                        if matches!(events[j], Event::Start(Tag::Item)) {
                            if let Some(item_end) = find_tag_end(events, j) {
                                items.push(node_text(events, j + 1, item_end).trim().to_string());
                                j = item_end + 1;
                                continue;
                            }
                        }
                        j += 1;
                    }
                    parts.push(items.join("\n"));
                    i = close + 1;
                    continue;
                }
            }
            Event::Start(Tag::Table(_)) => {
                if let Some(close) = find_tag_end(events, i) {
                    parts.push(table_to_text(events, i + 1, close));
                    i = close + 1;
                    continue;
                }
            }
            Event::Start(Tag::CodeBlock(_)) => {
                if let Some(end) = find_tag_end(events, i) {
                    parts.push(node_text(events, i + 1, end));
                    i = end + 1;
                    continue;
                }
            }
            _ => {}
        }
        i += 1;
    }
    parts.into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n\n")
}

fn table_to_text(events: &[Event<'_>], start: usize, end: usize) -> String {
    let mut rows: Vec<String> = Vec::new();
    let mut i = start;
    while i < end {
        if matches!(events[i], Event::Start(Tag::TableRow)) {
            if let Some(row_end) = find_tag_end(events, i) {
                let mut cells = Vec::new();
                let mut j = i + 1;
                while j < row_end {
                    if matches!(events[j], Event::Start(Tag::TableCell)) {
                        if let Some(cell_end) = find_tag_end(events, j) {
                            cells.push(node_text(events, j + 1, cell_end).trim().to_string());
                            j = cell_end + 1;
                            continue;
                        }
                    }
                    j += 1;
                }
                rows.push(cells.join(" | "));
                i = row_end + 1;
                continue;
            }
        }
        i += 1;
    }
    rows.join("\n")
}

fn find_tag_end(events: &[Event<'_>], start: usize) -> Option<usize> {
    let start_tag = &events[start];
    let mut depth = 1usize;
    for (i, ev) in events.iter().enumerate().skip(start + 1) {
        match (start_tag, ev) {
            (Event::Start(tag), Event::Start(inner)) if tag_matches_start(tag, inner) => depth += 1,
            (Event::Start(tag), Event::End(end)) if tag_matches_end(tag, end) => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn tag_matches_start(start: &Tag<'_>, inner: &Tag<'_>) -> bool {
    std::mem::discriminant(start) == std::mem::discriminant(inner)
}

fn tag_matches_end(start: &Tag<'_>, end: &TagEnd) -> bool {
    matches!(
        (start, end),
        (Tag::Paragraph, TagEnd::Paragraph)
            | (Tag::BlockQuote(_), TagEnd::BlockQuote(_))
            | (Tag::List(_), TagEnd::List(_))
            | (Tag::Item, TagEnd::Item)
            | (Tag::Table(_), TagEnd::Table)
            | (Tag::TableRow, TagEnd::TableRow)
            | (Tag::TableCell, TagEnd::TableCell)
            | (Tag::Heading { .. }, TagEnd::Heading(_))
            | (Tag::CodeBlock(_), TagEnd::CodeBlock)
    )
}

fn heading_level_no(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

#[derive(Debug)]
struct TopBlock {
    heading_level: Option<u8>,
    heading_text: String,
    body_start: usize,
    body_end: usize,
}

fn top_level_blocks(events: &[Event<'_>]) -> Vec<TopBlock> {
    let mut blocks: Vec<TopBlock> = Vec::new();
    let mut current: Option<TopBlock> = None;
    let mut depth = 0i32;

    for (i, ev) in events.iter().enumerate() {
        match ev {
            Event::Start(tag) => {
                if depth == 0 {
                    if let Tag::Heading { level, .. } = tag {
                        let level_no = heading_level_no(*level);
                        if level_no <= 3 {
                            if let Some(mut block) = current.take() {
                                block.body_end = i;
                                blocks.push(block);
                            }
                            if level_no == 1 {
                                current = Some(TopBlock {
                                    heading_level: None,
                                    heading_text: String::new(),
                                    body_start: find_tag_end(events, i)
                                        .map(|e| e + 1)
                                        .unwrap_or(i + 1),
                                    body_end: events.len(),
                                });
                            } else {
                                let text = find_tag_end(events, i)
                                    .map(|end| node_text(events, i + 1, end).trim().to_string())
                                    .unwrap_or_default();
                                current = Some(TopBlock {
                                    heading_level: Some(level_no),
                                    heading_text: text,
                                    body_start: find_tag_end(events, i)
                                        .map(|e| e + 1)
                                        .unwrap_or(i + 1),
                                    body_end: events.len(),
                                });
                            }
                        } else if current.is_none() {
                            current = Some(TopBlock {
                                heading_level: None,
                                heading_text: String::new(),
                                body_start: i,
                                body_end: events.len(),
                            });
                        }
                    } else if current.is_none() {
                        current = Some(TopBlock {
                            heading_level: None,
                            heading_text: String::new(),
                            body_start: i,
                            body_end: events.len(),
                        });
                    }
                }
                depth += 1;
            }
            Event::End(_) => {
                depth -= 1;
            }
            _ => {}
        }
    }

    if let Some(mut block) = current.take() {
        block.body_end = events.len();
        blocks.push(block);
    }
    blocks
}

fn chunk_body(body: &str, meta: &DocMeta) -> Vec<BodyChunk> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let events: Vec<Event<'_>> = Parser::new_ext(body, options).collect();
    let blocks = top_level_blocks(&events);

    let mut ledger = SlugLedger::new();
    let mut out: Vec<BodyChunk> = Vec::new();
    let mut last_h2 = String::new();

    for block in blocks {
        let heading_text = block.heading_text.trim().to_string();
        let slug = if heading_text.is_empty() {
            String::new()
        } else {
            ledger.next(&heading_text)
        };
        let path = match block.heading_level {
            Some(2) => {
                last_h2 = heading_text.clone();
                [meta.title.as_str(), heading_text.as_str()]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .copied()
                    .collect::<Vec<_>>()
                    .join(" / ")
            }
            Some(3) => [meta.title.as_str(), last_h2.as_str(), heading_text.as_str()]
                .iter()
                .filter(|s| !s.is_empty())
                .copied()
                .collect::<Vec<_>>()
                .join(" / "),
            _ => meta.title.clone(),
        };
        let body_text = block_to_text(&events, block.body_start, block.body_end)
            .trim()
            .to_string();
        if body_text.len() < MIN_BODY {
            continue;
        }
        for part in split_oversized(&body_text) {
            let trimmed = part.trim();
            if trimmed.len() < MIN_BODY {
                continue;
            }
            out.push(BodyChunk {
                text: trimmed.to_string(),
                path: path.clone(),
                slug: slug.clone(),
            });
        }
    }

    out
}

fn chunk_structured_sections(body: &str, meta: &DocMeta) -> Vec<SearchChunk> {
    let split = split_markdown_on_h2(body);
    if split.sections.is_empty() {
        return Vec::new();
    }
    let mut ledger = SlugLedger::new();
    let mut out = Vec::new();
    let mut index = 0usize;
    for sec in &split.sections {
        let text = [sec.label.as_str(), sec.body_markdown.as_str()]
            .iter()
            .filter(|s| !s.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join("\n\n")
            .trim()
            .to_string();
        if text.len() < MIN_BODY_STRUCTURED {
            continue;
        }
        let slug = ledger.next(&sec.label);
        for part in split_oversized(&text) {
            let trimmed = part.trim();
            if trimmed.len() < MIN_BODY_STRUCTURED {
                continue;
            }
            out.push(SearchChunk {
                source: String::new(),
                chunk_index: index,
                text: trimmed.to_string(),
                heading_path: [meta.title.as_str(), sec.label.as_str()]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .copied()
                    .collect::<Vec<_>>()
                    .join(" / "),
                heading_slug: slug.clone(),
                doc_type: meta.doc_type.clone(),
                title: meta.title.clone(),
                timestamp: meta.timestamp.clone(),
                tags: meta.tags.clone(),
            });
            index += 1;
        }
    }
    out
}

fn dataset_overview_text(fm: &BTreeMap<String, Value>, meta: &DocMeta) -> String {
    let mut parts = vec![meta.title.clone()];
    if let Some(desc) = yaml_str(fm, "description") {
        if !desc.is_empty() {
            parts.push(desc);
        }
    }
    if let Some(Value::Mapping(pub_map)) = fm.get("publisher") {
        if let Some(Value::String(name)) = pub_map.get(Value::String("name".into())) {
            if !name.is_empty() {
                parts.push(format!("Publisher: {name}"));
            }
        }
    }
    if let Some(license) = yaml_str(fm, "license") {
        if !license.is_empty() {
            parts.push(format!("License: {license}"));
        }
    }
    if let Some(theme) = yaml_str(fm, "theme") {
        if !theme.is_empty() {
            parts.push(format!("Theme: {theme}"));
        }
    }
    if let Some(Value::Sequence(dists)) = fm.get("distributions") {
        for item in dists {
            if let Value::Mapping(map) = item {
                let title = map
                    .get(Value::String("title".into()))
                    .and_then(|v| v.as_str());
                let format = map
                    .get(Value::String("format".into()))
                    .and_then(|v| v.as_str());
                if let (Some(title), Some(format)) = (title, format) {
                    parts.push(format!("Distribution: {title} ({format})"));
                }
            }
        }
    }
    parts.into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n")
}

fn finalize_chunks(rel_path: &str, meta: &DocMeta, raw: Vec<BodyChunk>) -> Vec<SearchChunk> {
    raw.into_iter()
        .enumerate()
        .map(|(i, c)| SearchChunk {
            source: rel_path.to_string(),
            chunk_index: i,
            text: c.text,
            heading_path: c.path,
            heading_slug: c.slug,
            doc_type: meta.doc_type.clone(),
            title: meta.title.clone(),
            timestamp: meta.timestamp.clone(),
            tags: meta.tags.clone(),
        })
        .collect()
}

fn flat_body_text(body: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let events: Vec<Event<'_>> = Parser::new_ext(body, options).collect();
    block_to_text(&events, 0, events.len()).trim().to_string()
}

pub fn chunk_document(source: &str, rel_path: &str) -> Vec<SearchChunk> {
    let (frontmatter, body) = split_source(source);
    let (meta, fm) = read_meta(frontmatter);
    if meta.skip || is_not_found_path(rel_path) {
        return Vec::new();
    }

    if STRUCTURED_DOC_TYPES.contains(&meta.doc_type.as_str()) {
        let mut structured = chunk_structured_sections(body, &meta);
        if !structured.is_empty() {
            for chunk in &mut structured {
                chunk.source = rel_path.to_string();
            }
            return structured;
        }
    }

    let mut body_chunks = chunk_body(body, &meta);
    if body_chunks.is_empty()
        && (meta.doc_type == "reference" || meta.doc_type == "glossary-term")
    {
        let flat = flat_body_text(body);
        if flat.len() >= MIN_BODY_STRUCTURED {
            body_chunks.push(BodyChunk {
                text: flat,
                path: meta.title.clone(),
                slug: String::new(),
            });
        }
    }
    let mut chunks = finalize_chunks(rel_path, &meta, body_chunks);

    if meta.doc_type == "dataset" {
        let overview = dataset_overview_text(&fm, &meta).trim().to_string();
        if overview.len() >= MIN_BODY_STRUCTURED {
            let overview_chunk = SearchChunk {
                source: rel_path.to_string(),
                chunk_index: 0,
                text: overview,
                heading_path: meta.title.clone(),
                heading_slug: String::new(),
                doc_type: meta.doc_type.clone(),
                title: meta.title.clone(),
                timestamp: meta.timestamp.clone(),
                tags: meta.tags.clone(),
            };
            chunks = std::iter::once(overview_chunk)
                .chain(chunks.into_iter().enumerate().map(|(i, mut c)| {
                    c.chunk_index = i + 1;
                    c
                }))
                .collect();
        }
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_article_body() {
        let source = r#"---
type: article
title: Hello
timestamp: 2026-07-04T00:00:00Z
---

# Hello

This section has enough body text to become a searchable chunk when indexed.
"#;
        let chunks = chunk_document(source, "posts/hello.md");
        assert!(!chunks.is_empty());
        assert!(chunks[0].text.len() >= MIN_BODY);
    }
}