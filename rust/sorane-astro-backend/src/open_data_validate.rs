use std::collections::HashSet;

const EU_DATA_THEME_CODES: &[&str] = &[
    "AGRI", "ECON", "EDUC", "ENER", "ENVI", "GOVE", "HEAL", "INTR", "JUST", "REGI", "SOCI",
    "TECH", "TRAN",
];

const KNOWN_LICENSES: &[&str] = &[
    "MIT",
    "CC-BY-4.0",
    "CC-BY-3.0",
    "CC0-1.0",
    "EUPL-1.2",
];

pub fn parse_eu_data_theme_code(theme: &str) -> Option<String> {
    let trimmed = theme.trim();
    let uri_re = regex::Regex::new(r"(?i)data-theme/([A-Za-z]+)/?$").ok()?;
    if let Some(cap) = uri_re.captures(trimmed) {
        return cap.get(1).map(|m| m.as_str().to_uppercase());
    }
    if (2..=6).contains(&trimmed.len()) && trimmed.chars().all(|c| c.is_ascii_alphabetic()) {
        return Some(trimmed.to_uppercase());
    }
    None
}

pub fn validate_eu_theme_warnings(theme: Option<&str>, context: &str) -> Vec<String> {
    let Some(theme) = theme.filter(|t| !t.is_empty()) else {
        return Vec::new();
    };
    let Some(code) = parse_eu_data_theme_code(theme) else {
        return Vec::new();
    };
    let known: HashSet<&str> = EU_DATA_THEME_CODES.iter().copied().collect();
    if known.contains(code.as_str()) {
        return Vec::new();
    }
    let list = EU_DATA_THEME_CODES.join(", ");
    vec![format!(
        "{context}: unknown EU data-theme code \"{code}\"; expected one of {list}"
    )]
}

fn is_known_license_id(license: &str) -> bool {
    let trimmed = license.trim();
    trimmed.starts_with("http://") || trimmed.starts_with("https://") || KNOWN_LICENSES.contains(&trimmed)
}

struct DistributionRef {
    title: String,
    access_url: String,
}

fn parse_distributions(raw: Option<&serde_yaml::Value>) -> Vec<DistributionRef> {
    let Some(serde_yaml::Value::Sequence(seq)) = raw else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in seq {
        let serde_yaml::Value::Mapping(map) = item else {
            continue;
        };
        let title = map
            .get(serde_yaml::Value::String("title".into()))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        let format = map
            .get(serde_yaml::Value::String("format".into()))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        let access_url = map
            .get(serde_yaml::Value::String("accessURL".into()))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if let (Some(title), Some(_format), Some(access_url)) = (title, format, access_url) {
            out.push(DistributionRef {
                title: title.to_string(),
                access_url: access_url.to_string(),
            });
        }
    }
    out
}

fn parse_publisher_name(raw: Option<&serde_yaml::Value>) -> Option<String> {
    let serde_yaml::Value::Mapping(map) = raw? else {
        return None;
    };
    map.get(serde_yaml::Value::String("name".into()))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn validate_dataset_warnings(fm: &serde_yaml::Mapping) -> Vec<String> {
    let mut warnings = Vec::new();
    let license = fm
        .get(serde_yaml::Value::String("license".into()))
        .and_then(|v| v.as_str());
    if let Some(license) = license.filter(|s| !s.is_empty()) {
        if !is_known_license_id(license) {
            warnings.push(format!(
                "dataset: unknown license \"{license}\"; use SPDX id (e.g. CC-BY-4.0) or HTTPS URI"
            ));
        }
    }
    let distributions = parse_distributions(fm.get(serde_yaml::Value::String("distributions".into())));
    for dist in &distributions {
        if dist.access_url.to_lowercase().starts_with("http://") {
            warnings.push(format!(
                "dataset: distribution \"{}\" uses http:// accessURL; prefer https://",
                dist.title
            ));
        }
    }
    let theme = fm
        .get(serde_yaml::Value::String("theme".into()))
        .and_then(|v| v.as_str());
    warnings.extend(validate_eu_theme_warnings(theme, "dataset"));
    let publisher = parse_publisher_name(fm.get(serde_yaml::Value::String("publisher".into())));
    let has_license = license.is_some_and(|s| !s.is_empty());
    if (has_license || !distributions.is_empty()) && publisher.is_none() {
        warnings.push(
            "dataset: publisher.name is recommended when license or distributions are set"
                .to_string(),
        );
    }
    warnings
}