mod dcat;
mod open_data;
mod content_quality;
mod diagram;
mod directory_index;
mod faq;
mod glossary;
mod i18n_validate;
mod lang_mixing;
mod markdown_sections;
mod okf_validate;
mod open_data_validate;
mod reference;
mod redirect;
mod revision;
mod safe_url;
mod term_links;
mod unsafe_links;
mod validate;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::Compression;
use flate2::GzBuilder;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::io::Write;
use term_links::build_glossary_term_index;
use validate::{
    collect_file_validation, collect_site_validation, directory_listing_file_from_source,
    merge_validation, BackendOkf, BackendQuality, ValidateMode, ValidationContext,
    ValidationSummary,
};

const SCHEMA_VERSION: i32 = 1;
const IPTC_BASE: &str = "http://cv.iptc.org/newscodes/digitalsourcetype";

const KEY_ORDER: &[&str] = &[
    "type",
    "title",
    "timestamp",
    "description",
    "resource",
    "tags",
    "profile",
    "digitalSourceType",
    "euAiLabel",
    "aiDisclosureNote",
    "aiSystems",
];

const PHASE1_CODES: &[&str] = &[
    "trainedAlgorithmicMedia",
    "compositeWithTrainedAlgorithmicMedia",
    "compositeSynthetic",
    "algorithmicMedia",
    "humanEdits",
    "digitalCreation",
];

const RETIRED_ALIASES: &[(&str, &str)] = &[("digitalArt", "digitalCreation")];

#[derive(Debug, Deserialize)]
struct BackendFile {
    #[serde(rename = "relPath")]
    rel_path: String,
    source: String,
}

#[derive(Debug, Deserialize)]
struct BackendSite {
    title: String,
    description: String,
    #[serde(rename = "baseUrl", default)]
    base_url: String,
    #[serde(default)]
    lang: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct BackendOutputs {
    #[serde(default = "default_true")]
    catalog: bool,
    #[serde(rename = "llmsTxt", default = "default_true")]
    llms_txt: bool,
    #[serde(rename = "okfBundle", default = "default_true")]
    okf_bundle: bool,
    #[serde(default)]
    sitemap: bool,
    #[serde(rename = "dcatCatalog", default)]
    dcat_catalog: bool,
}

fn default_true() -> bool {
    true
}

impl Default for BackendOutputs {
    fn default() -> Self {
        Self {
            catalog: true,
            llms_txt: true,
            okf_bundle: true,
            sitemap: false,
            dcat_catalog: false,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
struct BackendOpenData {
    #[serde(rename = "dcatCatalog", default)]
    dcat_catalog: bool,
    #[serde(rename = "defaultLicense", default)]
    default_license: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BackendInput {
    #[serde(rename = "schema_version")]
    schema_version: i32,
    #[allow(dead_code)]
    root: String,
    #[allow(dead_code)]
    #[serde(rename = "contentDir")]
    content_dir: String,
    #[allow(dead_code)]
    #[serde(rename = "outDir")]
    out_dir: String,
    site: BackendSite,
    files: Vec<BackendFile>,
    #[serde(default)]
    permalink: Option<String>,
    #[serde(default)]
    collections: BTreeMap<String, String>,
    #[serde(default)]
    outputs: Option<BackendOutputs>,
    #[serde(default)]
    validate: Option<ValidateMode>,
    #[serde(default)]
    quality: Option<BackendQuality>,
    #[serde(default)]
    okf: Option<BackendOkf>,
    #[serde(rename = "openData", default)]
    open_data: Option<BackendOpenData>,
}

#[derive(Debug, Serialize)]
struct BackendArtifact {
    path: String,
    kind: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct BackendOutput {
    #[serde(rename = "schema_version")]
    schema_version: i32,
    concepts: usize,
    #[serde(rename = "validationErrors")]
    validation_errors: usize,
    #[serde(rename = "validationWarnings")]
    validation_warnings: usize,
    #[serde(rename = "validationDetails")]
    validation_details: Vec<String>,
    artifacts: Vec<BackendArtifact>,
}

#[derive(Debug)]
pub(crate) struct Concept {
    slug: String,
    okf_type: String,
    title: String,
    description: Option<String>,
    timestamp: Option<String>,
    profile: Option<String>,
    tags: Vec<String>,
    resource: Option<String>,
    frontmatter: BTreeMap<String, serde_yaml::Value>,
    body: String,
    url: String,
}

fn trim_slashes(s: &str) -> String {
    s.trim_matches('/').to_string()
}

fn html_rel_for_content(rel_path: &str, permalink: &str, collections: &BTreeMap<String, String>) -> String {
    let normalized = rel_path.replace('\\', "/");
    let without_ext = normalized
        .trim_end_matches(".mdx")
        .trim_end_matches(".md")
        .to_string();
    let parts: Vec<&str> = without_ext.split('/').collect();
    let collection = parts.first().copied().unwrap_or("");
    let entry_tail = parts.get(1..).unwrap_or(&[]).join("/");
    let route_parts: Vec<String> = match collections.get(collection) {
        Some(base) => {
            let mut out = vec![trim_slashes(base)];
            if !entry_tail.is_empty() {
                out.push(entry_tail);
            }
            out
        }
        None => parts.iter().map(|s| s.to_string()).collect(),
    };
    let route = route_parts.join("/");
    if route.is_empty() || route == "index" {
        return "index.html".to_string();
    }
    if route.ends_with("/index") {
        return format!("{}index.html", &route[..route.len() - "index".len()]);
    }
    if permalink == "directory" {
        return format!("{}/index.html", route);
    }
    format!("{}.html", route)
}

fn absolute_url(base_url: &str, rel: &str) -> String {
    if base_url.is_empty() {
        return rel.to_string();
    }
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        rel.trim_start_matches('/')
    )
}

fn slug_for_rel(rel_path: &str) -> String {
    let slug = rel_path
        .replace('\\', "/")
        .trim_end_matches(".mdx")
        .trim_end_matches(".md")
        .replace("/index", "")
        .replace('/', "-");
    if slug.is_empty() {
        "index".to_string()
    } else {
        slug
    }
}

pub(crate) fn resolve_effective_type(okf_type: &str, profile: Option<&str>) -> String {
    if okf_type.is_empty() {
        return String::new();
    }
    if profile == Some("sorane-okf/0.3") {
        if matches!(
            okf_type,
            "article"
                | "index"
                | "dataset"
                | "reference"
                | "glossary"
                | "glossary-term"
                | "faq"
        ) {
            return okf_type.to_string();
        }
        return "article".to_string();
    }
    okf_type.to_string()
}

fn is_okf_content(okf_type: &str, profile: Option<&str>) -> bool {
    matches!(
        resolve_effective_type(okf_type, profile).as_str(),
        "article" | "index" | "dataset" | "reference" | "glossary" | "glossary-term" | "faq"
    )
}

fn resolve_catalog_creative_work_type(concept: &Concept) -> String {
    let effective = resolve_effective_type(&concept.okf_type, concept.profile.as_deref());
    match effective.as_str() {
        "reference" => "TechArticle".to_string(),
        "faq" => "FAQPage".to_string(),
        "glossary" | "glossary-term" => "DefinedTermSet".to_string(),
        _ => {
            if let Some(serde_yaml::Value::String(override_type)) =
                concept.frontmatter.get("creativeWorkType")
            {
                if override_type == "TechArticle" || override_type == "BlogPosting" {
                    return override_type.clone();
                }
            }
            "BlogPosting".to_string()
        }
    }
}

fn extract_frontmatter(source: &str) -> (Option<&str>, &str) {
    let rest = match source.strip_prefix("---\n") {
        Some(r) => r,
        None => match source.strip_prefix("---\r\n") {
            Some(r) => r,
            None => return (None, source),
        },
    };

    for (idx, _) in rest.match_indices("\n---") {
        let fm = &rest[..idx];
        let after = &rest[idx + 1..];
        if let Some(body) = after.strip_prefix("---\n") {
            return (Some(fm), body);
        }
        if let Some(body) = after.strip_prefix("---\r\n") {
            return (Some(fm), body);
        }
        if after == "---" {
            return (Some(fm), "");
        }
        if let Some(body) = after.strip_prefix("---\r") {
            return (Some(fm), body);
        }
    }
    (None, source)
}

fn format_scalar_str(s: &str) -> String {
    if s.is_empty() {
        return "''".to_string();
    }
    let needs_quote = s.starts_with(|c: char| "-?:,[]{}#&*!|>'\"%@`".contains(c))
        || s.ends_with(' ')
        || s.starts_with(' ')
        || s.contains(": ")
        || s.contains(":\t")
        || s.ends_with(':')
        || s.contains(" #")
        || matches!(
            s.to_ascii_lowercase().as_str(),
            "true" | "false" | "null" | "yes" | "no" | "on" | "off" | "~"
        )
        || looks_like_number(s);
    if needs_quote {
        format!("'{}'", s.replace('\'', "''"))
    } else {
        s.to_string()
    }
}

fn looks_like_number(s: &str) -> bool {
    let bytes = s.as_bytes();
    let mut i = 0;
    if bytes.get(i) == Some(&b'+') || bytes.get(i) == Some(&b'-') {
        i += 1;
    }
    let start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == start {
        if bytes.get(i) == Some(&b'.') {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
        } else {
            return false;
        }
    } else if bytes.get(i) == Some(&b'.') {
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
    }
    if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
        i += 1;
        if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
            i += 1;
        }
        let exp_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == exp_start {
            return false;
        }
    }
    i == bytes.len()
}

fn format_scalar(value: &serde_yaml::Value) -> String {
    match value {
        serde_yaml::Value::Bool(b) => b.to_string(),
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::Null => "null".to_string(),
        serde_yaml::Value::String(s) => format_scalar_str(s),
        other => format_scalar_str(&serde_json::to_string(other).unwrap_or_else(|_| String::new())),
    }
}

fn append_yaml_entry(lines: &mut Vec<String>, key: &str, value: &serde_yaml::Value) {
    match value {
        serde_yaml::Value::Sequence(items) => {
            if items.is_empty() {
                lines.push(format!("{key}: []"));
                return;
            }
            lines.push(format!("{key}:"));
            for item in items {
                lines.push(format!("  - {}", format_scalar(item)));
            }
        }
        serde_yaml::Value::Mapping(map) => {
            lines.push(format!("{key}:"));
            for (k, v) in map {
                if let Some(k) = k.as_str() {
                    if !matches!(v, serde_yaml::Value::Null) {
                        lines.push(format!("  {k}: {}", format_scalar(v)));
                    }
                }
            }
        }
        serde_yaml::Value::Null => {}
        other => lines.push(format!("{key}: {}", format_scalar(other))),
    }
}

fn to_okf_frontmatter_lines(concept: &Concept) -> Vec<String> {
    let mut lines = vec![
        format!("type: {}", format_scalar_str(&concept.okf_type)),
        format!("title: {}", format_scalar_str(&concept.title)),
    ];
    if let Some(ts) = &concept.timestamp {
        lines.push(format!("timestamp: {}", format_scalar_str(ts)));
    }
    if let Some(desc) = &concept.description {
        lines.push(format!("description: {}", format_scalar_str(desc)));
    }
    if let Some(resource) = &concept.resource {
        lines.push(format!("resource: {}", format_scalar_str(resource)));
    }
    if !concept.tags.is_empty() {
        append_yaml_entry(
            &mut lines,
            "tags",
            &serde_yaml::Value::Sequence(
                concept
                    .tags
                    .iter()
                    .map(|t| serde_yaml::Value::String(t.clone()))
                    .collect(),
            ),
        );
    }
    if let Some(profile) = &concept.profile {
        lines.push(format!("profile: {}", format_scalar_str(profile)));
    }

    for key in ["digitalSourceType", "euAiLabel", "aiDisclosureNote"] {
        if let Some(value) = concept.frontmatter.get(key) {
            if let Some(s) = value.as_str() {
                if !s.is_empty() {
                    lines.push(format!("{key}: {}", format_scalar_str(s)));
                }
            }
        }
    }

    if let Some(systems) = concept.frontmatter.get("aiSystems") {
        if let serde_yaml::Value::Sequence(items) = systems {
            let parsed: Vec<BTreeMap<String, String>> = items
                .iter()
                .filter_map(|item| {
                    let map = item.as_mapping()?;
                    let name = map.get(serde_yaml::Value::String("name".into()))?;
                    let name = name.as_str()?.to_string();
                    let mut out = BTreeMap::new();
                    out.insert("name".to_string(), name);
                    if let Some(v) = map.get(serde_yaml::Value::String("version".into())) {
                        if let Some(s) = v.as_str() {
                            out.insert("version".to_string(), s.to_string());
                        }
                    }
                    if let Some(v) = map.get(serde_yaml::Value::String("provider".into())) {
                        if let Some(s) = v.as_str() {
                            out.insert("provider".to_string(), s.to_string());
                        }
                    }
                    Some(out)
                })
                .collect();
            if !parsed.is_empty() {
                lines.push("aiSystems:".to_string());
                for system in parsed {
                    lines.push(format!(
                        "  - name: {}",
                        format_scalar_str(system.get("name").unwrap())
                    ));
                    if let Some(version) = system.get("version") {
                        lines.push(format!("    version: {}", format_scalar_str(version)));
                    }
                    if let Some(provider) = system.get("provider") {
                        lines.push(format!("    provider: {}", format_scalar_str(provider)));
                    }
                }
            }
        }
    }

    let ordered: std::collections::BTreeSet<&str> = KEY_ORDER.iter().copied().collect();
    let reserved = [
        "type", "kind", "layout", "title", "timestamp", "publishedAt", "date", "description",
        "resource", "tags", "profile", "digitalSourceType", "euAiLabel", "aiDisclosureNote",
        "aiSystems",
    ];
    let mut rest_keys: Vec<&String> = concept
        .frontmatter
        .keys()
        .filter(|k| !ordered.contains(k.as_str()) && !reserved.contains(&k.as_str()))
        .collect();
    rest_keys.sort();
    for key in rest_keys {
        if let Some(value) = concept.frontmatter.get(key) {
            append_yaml_entry(&mut lines, key, value);
        }
    }
    lines
}

fn concept_to_okf_markdown(concept: &Concept) -> String {
    let lines = to_okf_frontmatter_lines(concept);
    format!("---\n{}\n---\n{}", lines.join("\n"), concept.body)
}

fn resolve_digital_source_type(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let code = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let normalized = trimmed.trim_end_matches('/');
        let prefix = format!("{IPTC_BASE}/");
        let http_uri = normalized.replacen("https://", "http://", 1);
        if !http_uri.starts_with(&prefix) {
            return None;
        }
        http_uri[prefix.len()..].to_string()
    } else {
        trimmed.to_string()
    };

    let mut resolved = code;
    for (from, to) in RETIRED_ALIASES {
        if resolved == *from {
            resolved = (*to).to_string();
            break;
        }
    }

    if !PHASE1_CODES.contains(&resolved.as_str()) {
        return None;
    }

    Some(format!("{IPTC_BASE}/{resolved}"))
}

fn parse_ai_disclosure_uri(concept: &Concept) -> Option<String> {
    let raw = concept.frontmatter.get("digitalSourceType")?;
    let s = raw.as_str()?;
    resolve_digital_source_type(s)
}

fn has_ai_disclosure(concept: &Concept) -> bool {
    concept
        .frontmatter
        .get("digitalSourceType")
        .and_then(|v| v.as_str())
        .is_some()
        || concept.frontmatter.contains_key("aiDisclosureNote")
}

fn timestamp_to_unix(ts: &str) -> u64 {
    if ts.len() < 20 || !ts.ends_with('Z') {
        return 0;
    }
    let year: u64 = ts[0..4].parse().unwrap_or(0);
    let month: u64 = ts[5..7].parse().unwrap_or(0);
    let day: u64 = ts[8..10].parse().unwrap_or(0);
    let hour: u64 = ts[11..13].parse().unwrap_or(0);
    let minute: u64 = ts[14..16].parse().unwrap_or(0);
    let second: u64 = ts[17..19].parse().unwrap_or(0);

    let mut y = year;
    let mut m = month;
    if m <= 2 {
        y -= 1;
        m += 12;
    }
    let era = y / 400;
    let yoe = y - era * 400;
    let doy = (153 * (m - 3) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    days * 86_400 + hour * 3600 + minute * 60 + second
}

fn parse_concept(file: &BackendFile, input: &BackendInput) -> Result<Concept, String> {
    let (frontmatter_raw, body) = extract_frontmatter(&file.source);
    let frontmatter_raw =
        frontmatter_raw.ok_or_else(|| format!("{}: missing frontmatter", file.rel_path))?;
    let fm: BTreeMap<String, serde_yaml::Value> =
        serde_yaml::from_str(frontmatter_raw).map_err(|e| format!("{}: {}", file.rel_path, e))?;

    let okf_type = fm
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if okf_type.is_empty() {
        return Err(format!("{}: missing type", file.rel_path));
    }

    let title = fm
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let description = fm
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let timestamp = fm
        .get("timestamp")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let profile = fm
        .get("profile")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let resource = fm
        .get("resource")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let tags: Vec<String> = fm
        .get("tags")
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let mut extra = BTreeMap::new();
    for (key, value) in &fm {
        if matches!(
            key.as_str(),
            "type" | "title" | "timestamp" | "description" | "resource" | "tags" | "profile"
        ) {
            continue;
        }
        extra.insert(key.clone(), value.clone());
    }

    let permalink = input.permalink.as_deref().unwrap_or("html");
    let url_rel = html_rel_for_content(&file.rel_path, permalink, &input.collections);
    let url = absolute_url(&input.site.base_url, &url_rel);

    Ok(Concept {
        slug: slug_for_rel(&file.rel_path),
        okf_type,
        title,
        description,
        timestamp,
        profile,
        tags,
        resource,
        frontmatter: extra,
        body: body.to_string(),
        url,
    })
}

fn markdown_distribution(page_url: &str) -> Map<String, Value> {
    let mut node = Map::new();
    node.insert("@type".to_string(), json!("DataDownload"));
    node.insert("encodingFormat".to_string(), json!("text/markdown"));
    node.insert(
        "contentUrl".to_string(),
        json!(page_url.replace(".html", ".md")),
    );
    node
}

fn build_dataset_node(concept: &Concept) -> Map<String, Value> {
    let effective = resolve_effective_type(&concept.okf_type, concept.profile.as_deref());
    let mut keywords = vec![effective];
    keywords.extend(concept.tags.clone());

    if let Some(theme) = concept
        .frontmatter
        .get("theme")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        keywords.push(format!("theme:{theme}"));
    }

    let mut node = Map::new();
    node.insert("@type".to_string(), json!("Dataset"));
    node.insert("@id".to_string(), json!(concept.url));
    node.insert("name".to_string(), json!(concept.title));
    node.insert("keywords".to_string(), json!(keywords));

    if let Some(desc) = &concept.description {
        node.insert("description".to_string(), json!(desc));
    }
    if let Some(ts) = &concept.timestamp {
        node.insert("dateModified".to_string(), json!(ts));
    }
    if let Some(resource) = &concept.resource {
        node.insert("url".to_string(), json!(resource));
    }
    if let Some(identifier) = concept
        .frontmatter
        .get("identifier")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        node.insert("identifier".to_string(), json!(identifier));
    }
    if let Some(language) = concept
        .frontmatter
        .get("language")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        node.insert("inLanguage".to_string(), json!(language));
    }
    if let Some(license) = concept
        .frontmatter
        .get("license")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        node.insert(
            "license".to_string(),
            json!(open_data::resolve_license_url(license)),
        );
    }
    if let Some(publisher) = concept
        .frontmatter
        .get("publisher")
        .and_then(|v| open_data::parse_publisher(v))
    {
        let mut org = Map::new();
        org.insert("@type".to_string(), json!("Organization"));
        org.insert("name".to_string(), json!(publisher.name));
        if let Some(url) = publisher.url {
            org.insert("url".to_string(), json!(url));
        }
        node.insert("publisher".to_string(), Value::Object(org));
    }

    let mut downloads: Vec<Value> = open_data::distributions_from_frontmatter(&concept.frontmatter)
        .iter()
        .map(|d| {
            let content_url =
                open_data::resolve_distribution_url(&d.access_url, "", &concept.url);
            let mut download = Map::new();
            download.insert("@type".to_string(), json!("DataDownload"));
            download.insert("name".to_string(), json!(d.title));
            download.insert(
                "encodingFormat".to_string(),
                json!(open_data::resolve_media_type(&d.format)),
            );
            download.insert("contentUrl".to_string(), json!(content_url));
            if let Some(byte_size) = d.byte_size {
                download.insert("contentSize".to_string(), json!(byte_size));
            }
            Value::Object(download)
        })
        .collect();
    downloads.push(Value::Object(markdown_distribution(&concept.url)));
    node.insert("distribution".to_string(), Value::Array(downloads));

    if let Some(uri) = parse_ai_disclosure_uri(concept) {
        node.insert("digitalSourceType".to_string(), json!(uri));
    }
    node
}

fn build_creative_work_node(concept: &Concept) -> Map<String, Value> {
    let effective = resolve_effective_type(&concept.okf_type, concept.profile.as_deref());
    let mut keywords = vec![effective.clone()];
    keywords.extend(concept.tags.clone());

    let mut node = Map::new();
    node.insert(
        "@type".to_string(),
        json!(resolve_catalog_creative_work_type(concept).as_str()),
    );
    node.insert("@id".to_string(), json!(concept.url));
    node.insert("name".to_string(), json!(concept.title));
    node.insert("keywords".to_string(), json!(keywords));
    node.insert(
        "distribution".to_string(),
        Value::Array(vec![Value::Object(markdown_distribution(&concept.url))]),
    );
    if let Some(desc) = &concept.description {
        node.insert("description".to_string(), json!(desc));
    }
    if let Some(ts) = &concept.timestamp {
        node.insert("dateModified".to_string(), json!(ts));
    }
    if let Some(uri) = parse_ai_disclosure_uri(concept) {
        node.insert("digitalSourceType".to_string(), json!(uri));
    }
    if let Some(resource) = &concept.resource {
        node.insert("url".to_string(), json!(resource));
    }
    node
}

fn build_catalog(concepts: &[Concept], site_title: &str, base_url: &str) -> String {
    let mut datasets = Vec::new();
    let mut has_part = Vec::new();
    for c in concepts {
        let effective = resolve_effective_type(&c.okf_type, c.profile.as_deref());
        if effective == "dataset" {
            datasets.push(Value::Object(build_dataset_node(c)));
        } else {
            if effective == "index" {
                continue;
            }
            has_part.push(Value::Object(build_creative_work_node(c)));
        }
    }

    let mut catalog = Map::new();
    catalog.insert(
        "@context".to_string(),
        json!({
            "@vocab": "https://schema.org/",
            "dcat": "http://www.w3.org/ns/dcat#"
        }),
    );
    catalog.insert("@type".to_string(), json!("DataCatalog"));
    catalog.insert("name".to_string(), json!(site_title));
    if !base_url.is_empty() {
        catalog.insert("url".to_string(), json!(base_url));
    }
    if !datasets.is_empty() {
        catalog.insert("dataset".to_string(), Value::Array(datasets));
    }
    if !has_part.is_empty() {
        catalog.insert("hasPart".to_string(), Value::Array(has_part));
    }
    serde_json::to_string_pretty(&Value::Object(catalog)).unwrap_or_else(|_| "{}".to_string())
        + "\n"
}

fn build_llms(site: &BackendSite, concepts: &[Concept], dcat_catalog: bool) -> String {
    let base = site.base_url.trim_end_matches('/');
    let abs = |path: &str| {
        if base.is_empty() {
            path.to_string()
        } else {
            format!("{}/{}", base, path.trim_start_matches('/'))
        }
    };
    let labeled = concepts.iter().filter(|c| has_ai_disclosure(c)).count();
    let mut lines = vec![
        format!("# {}", site.title),
        String::new(),
        format!("> {}", site.description),
        String::new(),
        "## Machine-readable".to_string(),
        String::new(),
        format!(
            "- [OKF bundle]({}): all concepts as {{type}}/{{slug}}.md",
            abs("okf/bundle.tar.gz")
        ),
        format!(
            "- [Site catalog]({}): open datasets in `dataset[]`; other pages in `hasPart[]`",
            abs("catalog.jsonld")
        ),
    ];
    if dcat_catalog && dcat::has_dcat_datasets(concepts) {
        lines.push(format!(
            "- [DCAT catalog]({}): DCAT-AP JSON-LD for `type: dataset` pages only (portal harvest)",
            abs("catalog-dcat.jsonld")
        ));
    }
    lines.push(format!("- [Sitemap]({})", abs("sitemap.xml")));
    if labeled > 0 {
        lines.push(String::new());
        lines.push("## AI content disclosure".to_string());
        lines.push(String::new());
        lines.push(
            "Articles may declare `digitalSourceType` (IPTC NewsCodes / schema.org) in OKF frontmatter."
                .to_string(),
        );
        lines.push(
            "Published HTML includes JSON-LD `digitalSourceType` and optional EU transparency badges."
                .to_string(),
        );
        lines.push(
            "Search index (`assets/search-index.json`) exposes `digital_source_type` per chunk when set."
                .to_string(),
        );
        lines.push(
            "Atom feed (`feed.xml`) includes `category term` when disclosure is present."
                .to_string(),
        );
        lines.push(String::new());
        lines.push(format!("Labeled articles: {labeled}"));
    }
    for block in [
        "## Astro integration\n\nGenerated by `@sorane/astro`. Astro owns page rendering; sorane owns OKF and agent-readable publishing artifacts.",
        "## Native backends\n\nThe integration boundary is intentionally file-based so OKF parsing, validation, bundle creation, and search indexing can move to Rust/WASM or a Rust CLI without changing Astro routes.",
    ] {
        if !block.is_empty() {
            lines.extend(block.split('\n').map(|s| s.to_string()));
        }
    }
    lines.push(String::new());
    lines.join("\n")
}

fn build_ustar_tar(entries: &[(String, String, u64)]) -> Result<Vec<u8>, String> {
    let mut blocks: Vec<u8> = Vec::new();
    for (path, content, mtime) in entries {
        if path.len() > 100 {
            return Err(format!("bundle path exceeds tar name limit (100): {path}"));
        }
        let bytes = content.as_bytes();
        let mut header = vec![0u8; 512];
        header[..path.len()].copy_from_slice(path.as_bytes());
        header[100..108].copy_from_slice(b"0000644\0");
        header[108..116].copy_from_slice(b"0000000\0");
        header[116..124].copy_from_slice(b"0000000\0");
        let size_oct = format!("{:011o}\0", bytes.len());
        header[124..124 + size_oct.len()].copy_from_slice(size_oct.as_bytes());
        let mtime_oct = format!("{:011o}\0", mtime);
        header[136..136 + mtime_oct.len()].copy_from_slice(mtime_oct.as_bytes());
        header[148..156].copy_from_slice(b"        ");
        header[257..263].copy_from_slice(b"ustar\0");
        header[263..265].copy_from_slice(b"00");
        let mut checksum: u64 = 0;
        for b in &header {
            checksum += *b as u64;
        }
        let cksum = format!("{:06o}\0 ", checksum);
        header[148..148 + cksum.len()].copy_from_slice(cksum.as_bytes());
        blocks.extend_from_slice(&header);
        blocks.extend_from_slice(bytes);
        let pad = (512 - (bytes.len() % 512)) % 512;
        blocks.extend(vec![0u8; pad]);
    }
    blocks.extend(vec![0u8; 1024]);
    Ok(blocks)
}

fn build_bundle(concepts: &[Concept]) -> Result<String, String> {
    let mut entries: Vec<(String, String, u64)> = concepts
        .iter()
        .map(|c| {
            let mtime = c
                .timestamp
                .as_deref()
                .map(timestamp_to_unix)
                .unwrap_or(0);
            (
                format!("{}/{}.md", c.okf_type, c.slug),
                concept_to_okf_markdown(c),
                mtime,
            )
        })
        .collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let tar_bytes = build_ustar_tar(&entries)?;
    let mut gz_buf = Vec::new();
    let mut encoder = GzBuilder::new()
        .operating_system(3)
        .write(&mut gz_buf, Compression::default());
    encoder
        .write_all(&tar_bytes)
        .map_err(|e| e.to_string())?;
    encoder.finish().map_err(|e| e.to_string())?;
    let gz = gz_buf;
    Ok(STANDARD.encode(gz))
}

fn run_backend(input: BackendInput) -> Result<BackendOutput, String> {
    if input.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "unsupported schema_version: {}",
            input.schema_version
        ));
    }
    let outputs = input.outputs.clone().unwrap_or_default();
    let dcat_enabled = outputs.dcat_catalog
        || input
            .open_data
            .as_ref()
            .map(|o| o.dcat_catalog)
            .unwrap_or(false);
    let default_license = input
        .open_data
        .as_ref()
        .and_then(|o| o.default_license.as_deref());

    let mut validation = ValidationSummary {
        errors: 0,
        warnings: 0,
        details: Vec::new(),
    };
    let mut concepts = Vec::new();

    let validate_mode = input.validate.clone().unwrap_or(ValidateMode::Warn);
    let glossary_term_ids = build_glossary_term_index(
        &input
            .files
            .iter()
            .map(|f| (f.rel_path.as_str(), f.source.as_str()))
            .collect::<Vec<_>>(),
        &input.okf,
    );
    let site_lang = input
        .site
        .lang
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("ja");
    let base_url = input.site.base_url.trim();
    let validation_ctx = ValidationContext {
        site_lang,
        base_url: if base_url.is_empty() {
            None
        } else {
            Some(base_url)
        },
        glossary_term_ids: &glossary_term_ids,
        link_scheme_enabled: true,
        link_scheme_is_error: false,
    };
    let mut listing_files = Vec::new();
    for file in &input.files {
        if let Some(listing) =
            directory_listing_file_from_source(&file.rel_path, &file.source, &input.okf)
        {
            listing_files.push(listing);
        }

        if !matches!(validate_mode, ValidateMode::Off) {
            let (fm, body) = extract_frontmatter(&file.source);
            merge_validation(
                &mut validation,
                collect_file_validation(
                    &file.rel_path,
                    fm,
                    body,
                    &input.quality,
                    &input.okf,
                    &validation_ctx,
                ),
            );
        }

        if let Ok(concept) = parse_concept(file, &input) {
            if is_okf_content(&concept.okf_type, concept.profile.as_deref()) {
                concepts.push(concept);
            }
        }
    }

    if !matches!(validate_mode, ValidateMode::Off) {
        merge_validation(&mut validation, collect_site_validation(&listing_files));
    }

    let mut artifacts = Vec::new();
    if outputs.catalog {
        artifacts.push(BackendArtifact {
            path: "catalog.jsonld".to_string(),
            kind: "text".to_string(),
            content: build_catalog(&concepts, &input.site.title, &input.site.base_url),
        });
    }
    if outputs.llms_txt {
        artifacts.push(BackendArtifact {
            path: "llms.txt".to_string(),
            kind: "text".to_string(),
            content: build_llms(
                &input.site,
                &concepts,
                dcat_enabled && dcat::has_dcat_datasets(&concepts),
            ),
        });
    }
    if dcat_enabled {
        if let Some(content) = dcat::build_catalog_dcat(
            &concepts,
            &input.site.title,
            &input.site.description,
            &input.site.base_url,
            default_license,
        ) {
            artifacts.push(BackendArtifact {
                path: "catalog-dcat.jsonld".to_string(),
                kind: "text".to_string(),
                content,
            });
        }
    }
    if outputs.okf_bundle {
        artifacts.push(BackendArtifact {
            path: "okf/bundle.tar.gz".to_string(),
            kind: "base64".to_string(),
            content: build_bundle(&concepts)?,
        });
    }
    if outputs.sitemap {
        let base = input.site.base_url.trim_end_matches('/');
        let mut urls = String::new();
        for c in &concepts {
            let rel = if c.url.starts_with("http") && !base.is_empty() {
                c.url.replace(&format!("{base}/"), "")
            } else {
                c.url.clone()
            };
            let loc = if base.is_empty() {
                rel
            } else {
                format!("{base}/{rel}")
            };
            let mut parts = vec![format!("    <loc>{}</loc>", xml_escape(&loc))];
            if let Some(ts) = &c.timestamp {
                parts.push(format!("    <lastmod>{}</lastmod>", xml_escape(ts)));
            }
            let is_index = resolve_effective_type(&c.okf_type, c.profile.as_deref()) == "index";
            parts.push(format!("    <priority>{}</priority>", if is_index { "0.8" } else { "0.5" }));
            urls.push_str(&format!("  <url>\n{}\n  </url>\n", parts.join("\n")));
        }
        let sitemap = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{}</urlset>\n",
            urls
        );
        artifacts.push(BackendArtifact {
            path: "sitemap.xml".to_string(),
            kind: "text".to_string(),
            content: sitemap,
        });
    }

    Ok(BackendOutput {
        schema_version: SCHEMA_VERSION,
        concepts: concepts.len(),
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        validation_details: validation.details,
        artifacts,
    })
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn main() {
    let mut stdin = String::new();
    if std::io::Read::read_to_string(&mut std::io::stdin(), &mut stdin).is_err() {
        eprintln!("failed to read stdin");
        std::process::exit(1);
    }
    let input: BackendInput = match serde_json::from_str(&stdin) {
        Ok(v) => v,
        Err(err) => {
            eprintln!("invalid input JSON: {err}");
            std::process::exit(1);
        }
    };
    match run_backend(input) {
        Ok(output) => {
            println!("{}", serde_json::to_string(&output).expect("serialize output"));
        }
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(1);
        }
    }
}