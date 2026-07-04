use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;

const SCHEMA_VERSION: i32 = 1;

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
        }
    }
}

#[derive(Debug, Deserialize)]
struct BackendInput {
    #[serde(rename = "schema_version")]
    schema_version: i32,
    root: String,
    #[serde(rename = "contentDir")]
    content_dir: String,
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
struct Concept {
    slug: String,
    okf_type: String,
    title: String,
    description: String,
    timestamp: String,
    url: String,
    frontmatter: String,
    body: String,
    ai_labeled: bool,
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
    format!("{}/{}", base_url.trim_end_matches('/'), rel.trim_start_matches('/'))
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

fn is_okf_content(okf_type: &str) -> bool {
    matches!(
        okf_type,
        "article" | "index" | "dataset" | "reference" | "glossary" | "glossary-term" | "faq"
    )
}

fn split_frontmatter(source: &str) -> Result<(&str, &str), String> {
    let trimmed = source.trim_start();
    if !trimmed.starts_with("---") {
        return Err("missing frontmatter".to_string());
    }
    let rest = trimmed
        .trim_start_matches("---")
        .trim_start_matches('\n')
        .trim_start_matches('\r');
    let (frontmatter, body) = rest
        .split_once("\n---\n")
        .or_else(|| rest.split_once("\r\n---\r\n"))
        .ok_or_else(|| "missing closing frontmatter delimiter".to_string())?;
    Ok((frontmatter, body))
}

fn parse_concept(file: &BackendFile, input: &BackendInput) -> Result<Concept, String> {
    let source = &file.source;
    let (frontmatter, body) =
        split_frontmatter(source).map_err(|reason| format!("{}: {reason}", file.rel_path))?;
    let fm: BTreeMap<String, serde_yaml::Value> =
        serde_yaml::from_str(frontmatter).map_err(|e| format!("{}: {}", file.rel_path, e))?;
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
        .unwrap_or("")
        .to_string();
    let timestamp = fm
        .get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let ai_labeled = fm.contains_key("digitalSourceType") || fm.contains_key("aiDisclosureNote");
    let permalink = input.permalink.as_deref().unwrap_or("html");
    let url_rel = html_rel_for_content(&file.rel_path, permalink, &input.collections);
    Ok(Concept {
        slug: slug_for_rel(&file.rel_path),
        okf_type,
        title,
        description,
        timestamp,
        url: absolute_url(&input.site.base_url, &url_rel),
        frontmatter: frontmatter.to_string(),
        body: body.to_string(),
        ai_labeled,
    })
}

fn build_catalog(concepts: &[Concept], site_title: &str, base_url: &str) -> String {
    let mut has_part = Vec::new();
    for c in concepts {
        if c.okf_type == "index" {
            continue;
        }
        let md_url = c.url.replace(".html", ".md");
        has_part.push(serde_json::json!({
            "@type": "BlogPosting",
            "@id": c.url,
            "name": c.title,
            "keywords": [c.okf_type],
            "distribution": [{
                "@type": "DataDownload",
                "encodingFormat": "text/markdown",
                "contentUrl": md_url
            }],
            "description": c.description,
            "dateModified": c.timestamp,
        }));
    }
    let catalog = serde_json::json!({
        "@context": {
            "@vocab": "https://schema.org/",
            "dcat": "http://www.w3.org/ns/dcat#"
        },
        "@type": "DataCatalog",
        "name": site_title,
        "url": base_url,
        "hasPart": has_part,
    });
    serde_json::to_string_pretty(&catalog).unwrap_or_else(|_| "{}".to_string())
}

fn build_llms(site: &BackendSite, concepts: &[Concept]) -> String {
    let base = site.base_url.trim_end_matches('/');
    let abs = |path: &str| {
        if base.is_empty() {
            path.to_string()
        } else {
            format!("{}/{}", base, path.trim_start_matches('/'))
        }
    };
    let labeled = concepts.iter().filter(|c| c.ai_labeled).count();
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
        format!("- [Sitemap]({})", abs("sitemap.xml")),
    ];
    if labeled > 0 {
        lines.push(String::new());
        lines.push("## AI content disclosure".to_string());
        lines.push(String::new());
        lines.push(
            "Articles may declare `digitalSourceType` (IPTC NewsCodes / schema.org) in OKF frontmatter."
                .to_string(),
        );
        lines.push(format!("Labeled articles: {labeled}"));
    }
    lines.push("## Astro integration".to_string());
    lines.push(String::new());
    lines.push(
        "Generated by `@sorane/astro`. Astro owns page rendering; sorane owns OKF and agent-readable publishing artifacts."
            .to_string(),
    );
    lines.push("## Native backends".to_string());
    lines.push(String::new());
    lines.push(
        "The integration boundary is intentionally file-based so OKF parsing, validation, bundle creation, and search indexing can move to Rust/WASM or a Rust CLI without changing Astro routes."
            .to_string(),
    );
    lines.push(String::new());
    lines.join("\n")
}

fn build_bundle(concepts: &[Concept]) -> Result<String, String> {
    let mut entries: Vec<_> = concepts
        .iter()
        .map(|c| {
            (
                format!("{}/{}.md", c.okf_type, c.slug),
                format!("---\n{}\n---\n\n{}", c.frontmatter, c.body),
            )
        })
        .collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let mut tar_builder = tar::Builder::new(Vec::new());
    for (path, content) in entries {
        let mut header = tar::Header::new_gnu();
        header.set_path(&path).map_err(|e| e.to_string())?;
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        tar_builder
            .append(&header, content.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    tar_builder.finish().map_err(|e| e.to_string())?;
    let tar_bytes = tar_builder.into_inner().map_err(|e| e.to_string())?;

    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&tar_bytes).map_err(|e| e.to_string())?;
    let gz = encoder.finish().map_err(|e| e.to_string())?;
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
    let permalink = input.permalink.as_deref().unwrap_or("html");

    let mut validation_errors = 0usize;
    let validation_warnings = 0usize;
    let mut validation_details = Vec::new();
    let mut concepts = Vec::new();

    for file in &input.files {
        match parse_concept(file, &input) {
            Ok(concept) => {
                if is_okf_content(&concept.okf_type) {
                    concepts.push(concept);
                }
            }
            Err(message) => {
                validation_errors += 1;
                validation_details.push(message);
            }
        }
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
            content: build_llms(&input.site, &concepts),
        });
    }
    if outputs.okf_bundle {
        artifacts.push(BackendArtifact {
            path: "okf/bundle.tar.gz".to_string(),
            kind: "base64".to_string(),
            content: build_bundle(&concepts)?,
        });
    }
    if outputs.sitemap {
        let mut urls = String::new();
        for c in &concepts {
            urls.push_str(&format!(
                "  <url><loc>{}</loc></url>\n",
                c.url
            ));
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

    let _ = permalink; // reserved for future parity checks

    Ok(BackendOutput {
        schema_version: SCHEMA_VERSION,
        concepts: concepts.len(),
        validation_errors,
        validation_warnings,
        validation_details,
        artifacts,
    })
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