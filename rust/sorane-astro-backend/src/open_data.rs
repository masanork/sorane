use serde_yaml::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct PublisherRef {
    pub name: String,
    pub url: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DistributionRef {
    pub title: String,
    pub format: String,
    pub access_url: String,
    pub download_url: Option<String>,
    pub byte_size: Option<u64>,
    pub checksum: Option<String>,
}

pub fn resolve_license_url(license: &str) -> String {
    let trimmed = license.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    static SPDX: &[(&str, &str)] = &[
        ("MIT", "https://opensource.org/license/mit"),
        ("CC-BY-4.0", "https://creativecommons.org/licenses/by/4.0/"),
        ("CC-BY-3.0", "https://creativecommons.org/licenses/by/3.0/"),
        ("CC0-1.0", "https://creativecommons.org/publicdomain/zero/1.0/"),
        (
            "EUPL-1.2",
            "https://interoperable.europe.eu/collection/eupl/eupl-text-eupl-12",
        ),
    ];
    for (id, url) in SPDX {
        if trimmed == *id {
            return (*url).to_string();
        }
    }
    trimmed.to_string()
}

pub fn resolve_media_type(format: &str) -> String {
    let key = format.trim().to_lowercase();
    static FORMAT_MEDIA: &[(&str, &str)] = &[
        ("csv", "text/csv"),
        ("tsv", "text/tab-separated-values"),
        ("json", "application/json"),
        ("jsonld", "application/ld+json"),
        ("xml", "application/xml"),
        ("pdf", "application/pdf"),
        ("md", "text/markdown"),
        ("html", "text/html"),
        ("parquet", "application/vnd.apache.parquet"),
        (
            "xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    ];
    for (fmt, media) in FORMAT_MEDIA {
        if key == *fmt {
            return (*media).to_string();
        }
    }
    if key.contains('/') {
        return key;
    }
    key
}

pub fn parse_publisher(raw: &Value) -> Option<PublisherRef> {
    let map = raw.as_mapping()?;
    let name = map.get(Value::String("name".into()))?.as_str()?;
    if name.is_empty() {
        return None;
    }
    let url = map
        .get(Value::String("url".into()))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let email = map
        .get(Value::String("email".into()))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    Some(PublisherRef {
        name: name.to_string(),
        url,
        email,
    })
}

pub fn parse_distributions(raw: Option<&Value>) -> Vec<DistributionRef> {
    let Some(Value::Sequence(items)) = raw else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in items {
        let Some(map) = item.as_mapping() else {
            continue;
        };
        let title = map
            .get(Value::String("title".into()))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let format = map
            .get(Value::String("format".into()))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let access_url = map
            .get(Value::String("accessURL".into()))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if title.is_empty() || format.is_empty() || access_url.is_empty() {
            continue;
        }
        let download_url = map
            .get(Value::String("downloadURL".into()))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let byte_size = map.get(Value::String("byteSize".into())).and_then(|v| {
            v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64))
        });
        let checksum = map
            .get(Value::String("checksum".into()))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        out.push(DistributionRef {
            title: title.to_string(),
            format: format.to_string(),
            access_url: access_url.to_string(),
            download_url,
            byte_size,
            checksum,
        });
    }
    out
}

pub fn distributions_from_frontmatter(fm: &BTreeMap<String, Value>) -> Vec<DistributionRef> {
    if let Some(raw) = fm.get("distributions") {
        return parse_distributions(Some(raw));
    }
    parse_distributions(fm.get("distribution"))
}

pub fn resolve_distribution_url(access_url: &str, base_url: &str, page_url: &str) -> String {
    let trimmed = access_url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    if trimmed.starts_with('/') {
        return if base_url.is_empty() {
            trimmed.to_string()
        } else {
            format!("{base_url}{trimmed}")
        };
    }
    let base = if page_url.ends_with('/') {
        page_url.to_string()
    } else {
        match page_url.rsplit_once('/') {
            Some((head, _)) => format!("{head}/"),
            None => String::new(),
        }
    };
    format!("{base}{trimmed}")
}