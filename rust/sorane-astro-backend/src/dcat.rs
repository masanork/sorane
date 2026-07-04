use crate::open_data::{
    distributions_from_frontmatter, parse_publisher, resolve_distribution_url, resolve_license_url,
    resolve_media_type,
};
use crate::Concept;
use serde_json::{json, Map, Value};


pub fn is_dataset_entry(concept: &Concept) -> bool {
    crate::resolve_effective_type(&concept.okf_type, concept.profile.as_deref()) == "dataset"
}

pub fn has_dcat_datasets(concepts: &[Concept]) -> bool {
    concepts.iter().any(is_dataset_entry)
}

fn foaf_agent(
    name: &str,
    url: Option<&str>,
    email: Option<&str>,
) -> Map<String, Value> {
    let mut node = Map::new();
    node.insert("@type".to_string(), json!("foaf:Agent"));
    node.insert("foaf:name".to_string(), json!(name));
    if let Some(url) = url {
        node.insert("foaf:homepage".to_string(), json!(url));
    }
    if let Some(email) = email {
        node.insert("foaf:mbox".to_string(), json!(format!("mailto:{email}")));
    }
    node
}

fn dcat_distribution(
    dist: &crate::open_data::DistributionRef,
    page_url: &str,
    base_url: &str,
) -> Map<String, Value> {
    let access_url = resolve_distribution_url(&dist.access_url, base_url, page_url);
    let download_url = dist
        .download_url
        .as_deref()
        .map(|u| resolve_distribution_url(u, base_url, page_url))
        .unwrap_or_else(|| access_url.clone());

    let mut node = Map::new();
    node.insert("@type".to_string(), json!("dcat:Distribution"));
    node.insert("dct:title".to_string(), json!(dist.title));
    node.insert(
        "dcat:accessURL".to_string(),
        json!({ "@id": access_url }),
    );
    node.insert(
        "dcat:downloadURL".to_string(),
        json!({ "@id": download_url }),
    );
    node.insert("dct:format".to_string(), json!(dist.format));
    node.insert(
        "dcat:mediaType".to_string(),
        json!(resolve_media_type(&dist.format)),
    );
    if let Some(byte_size) = dist.byte_size {
        node.insert("dcat:byteSize".to_string(), json!(byte_size));
    }
    if let Some(checksum) = &dist.checksum {
        node.insert("dct:conformsTo".to_string(), json!(checksum));
    }
    node
}

fn build_dcat_dataset_node(
    concept: &Concept,
    base_url: &str,
    default_license: Option<&str>,
) -> Map<String, Value> {
    let fm = &concept.frontmatter;

    let mut node = Map::new();
    node.insert("@type".to_string(), json!("dcat:Dataset"));
    node.insert("@id".to_string(), json!(concept.url));
    node.insert("dct:title".to_string(), json!(concept.title));
    if let Some(desc) = &concept.description {
        node.insert("dct:description".to_string(), json!(desc));
    }

    if let Some(identifier) = fm.get("identifier").and_then(|v| v.as_str()) {
        if !identifier.is_empty() {
            node.insert("dct:identifier".to_string(), json!(identifier));
        }
    }
    if let Some(resource) = &concept.resource {
        node.insert("dct:source".to_string(), json!(resource));
    }
    if let Some(language) = fm.get("language").and_then(|v| v.as_str()) {
        if !language.is_empty() {
            node.insert("dct:language".to_string(), json!(language));
        }
    }
    if let Some(theme) = fm.get("theme").and_then(|v| v.as_str()) {
        if !theme.is_empty() {
            node.insert("dcat:theme".to_string(), json!(theme));
        }
    }

    let license_raw = fm
        .get("license")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or(default_license);
    if let Some(license) = license_raw {
        node.insert(
            "dct:license".to_string(),
            json!({ "@id": resolve_license_url(license) }),
        );
    }

    if let Some(temporal) = fm.get("temporal").and_then(|v| v.as_mapping()) {
        let start = temporal
            .get(serde_yaml::Value::String("start".into()))
            .and_then(|v| v.as_str());
        let end = temporal
            .get(serde_yaml::Value::String("end".into()))
            .and_then(|v| v.as_str());
        if let Some(start) = start {
            if !start.is_empty() {
                let value = if let Some(end) = end.filter(|e| !e.is_empty()) {
                    format!("{start}/{end}")
                } else {
                    start.to_string()
                };
                node.insert("dct:temporal".to_string(), json!(value));
            }
        }
    }

    if let Some(spatial) = fm.get("spatial").and_then(|v| v.as_str()) {
        if !spatial.is_empty() {
            node.insert("dct:spatial".to_string(), json!(spatial));
        }
    }

    if let Some(ts) = &concept.timestamp {
        node.insert("dct:issued".to_string(), json!(ts));
        node.insert("dct:modified".to_string(), json!(ts));
    }
    if let Some(updated) = fm.get("updated").and_then(|v| v.as_str()) {
        if !updated.is_empty() {
            node.insert("dct:modified".to_string(), json!(updated));
        }
    }

    if let Some(publisher) = fm.get("publisher").and_then(parse_publisher) {
        node.insert(
            "dct:publisher".to_string(),
            Value::Object(foaf_agent(
                &publisher.name,
                publisher.url.as_deref(),
                publisher.email.as_deref(),
            )),
        );
    }

    let distributions = distributions_from_frontmatter(&fm);
    if !distributions.is_empty() {
        node.insert(
            "dcat:distribution".to_string(),
            Value::Array(
                distributions
                    .iter()
                    .map(|d| Value::Object(dcat_distribution(d, &concept.url, base_url)))
                    .collect(),
            ),
        );
    }

    if !concept.tags.is_empty() {
        node.insert("dct:subject".to_string(), json!(concept.tags));
    }

    node
}

pub fn build_catalog_dcat(
    concepts: &[Concept],
    site_title: &str,
    site_description: &str,
    base_url: &str,
    default_license: Option<&str>,
) -> Option<String> {
    let datasets: Vec<&Concept> = concepts.iter().filter(|c| is_dataset_entry(c)).collect();
    if datasets.is_empty() {
        return None;
    }

    let mut catalog = Map::new();
    catalog.insert(
        "@context".to_string(),
        json!({
            "dcat": "http://www.w3.org/ns/dcat#",
            "dct": "http://purl.org/dc/terms/",
            "foaf": "http://xmlns.com/foaf/0.1/",
            "xsd": "http://www.w3.org/2001/XMLSchema#"
        }),
    );
    catalog.insert("@type".to_string(), json!("dcat:Catalog"));
    catalog.insert("dct:title".to_string(), json!(site_title));
    if !site_description.is_empty() {
        catalog.insert("dct:description".to_string(), json!(site_description));
    }
    if !base_url.is_empty() {
        catalog.insert("dct:identifier".to_string(), json!(base_url));
    }

    catalog.insert(
        "dcat:dataset".to_string(),
        Value::Array(
            datasets
                .iter()
                .map(|c| {
                    Value::Object(build_dcat_dataset_node(
                        c,
                        base_url,
                        default_license,
                    ))
                })
                .collect(),
        ),
    );

    Some(
        serde_json::to_string_pretty(&Value::Object(catalog)).unwrap_or_else(|_| "{}".to_string())
            + "\n",
    )
}