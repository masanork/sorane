use std::collections::{HashMap, HashSet};

const AUTO_INDEXED_DIRS: &[&str] = &["glossary/terms"];
const NOT_FOUND_SLUG: &str = "404";
const MIN_ENTRIES: usize = 2;

const BUILDABLE_TYPES: &[&str] = &[
    "article",
    "dataset",
    "reference",
    "glossary",
    "glossary-term",
    "faq",
];

#[derive(Debug, Clone)]
pub struct DirectoryListingFile {
    pub rel_path: String,
    pub okf_type: String,
    pub title: String,
    pub is_system: bool,
    pub is_redirect: bool,
    pub is_search_view: bool,
}

fn normalize_rel(rel: &str) -> String {
    rel.replace('\\', "/")
}

fn posix_dirname(rel: &str) -> String {
    let norm = normalize_rel(rel);
    norm.rfind('/').map(|i| norm[..i].to_string()).unwrap_or_default()
}

fn slug_from_rel(rel: &str) -> String {
    let normalized = normalize_rel(rel);
    let base = normalized.split('/').next_back().unwrap_or(rel);
    base.replace(".md", "").replace(".MD", "")
}

fn is_buildable_content_type(okf_type: &str) -> bool {
    BUILDABLE_TYPES.contains(&okf_type)
}

fn is_eligible(file: &DirectoryListingFile) -> bool {
    if !is_buildable_content_type(&file.okf_type) {
        return false;
    }
    if file.okf_type == "index" {
        return false;
    }
    if file.is_system || file.is_redirect || file.is_search_view {
        return false;
    }
    let slug = slug_from_rel(&file.rel_path);
    if slug == "index" || slug == NOT_FOUND_SLUG {
        return false;
    }
    true
}

/// Site-level warnings for subdirectories missing author `index.md`.
pub fn discover_directory_index_warnings(files: &[DirectoryListingFile]) -> Vec<(String, String)> {
    let mut by_dir: HashMap<String, usize> = HashMap::new();
    let mut has_author_index = HashSet::new();

    for file in files {
        let rel = normalize_rel(&file.rel_path);
        let dir_rel = posix_dirname(&rel);
        let key = dir_rel.clone();

        if slug_from_rel(&rel) == "index" {
            has_author_index.insert(key.clone());
        }
        if !is_eligible(file) {
            continue;
        }
        if dir_rel.is_empty() || AUTO_INDEXED_DIRS.contains(&dir_rel.as_str()) {
            continue;
        }
        *by_dir.entry(key).or_insert(0) += 1;
    }

    let mut warnings = Vec::new();
    for (dir_rel, count) in by_dir {
        if has_author_index.contains(&dir_rel) {
            continue;
        }
        if count < MIN_ENTRIES {
            continue;
        }
        let virtual_file = format!("{dir_rel}/");
        let message = format!(
            "okf: directory {dir_rel}/ has no index.md; build auto-generates OKF listing"
        );
        warnings.push((virtual_file, message));
    }

    warnings.sort_by(|a, b| a.0.cmp(&b.0));
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warns_when_subdir_has_two_pages_without_index() {
        let files = vec![
            DirectoryListingFile {
                rel_path: "posts/a.md".into(),
                okf_type: "article".into(),
                title: "A".into(),
                is_system: false,
                is_redirect: false,
                is_search_view: false,
            },
            DirectoryListingFile {
                rel_path: "posts/b.md".into(),
                okf_type: "article".into(),
                title: "B".into(),
                is_system: false,
                is_redirect: false,
                is_search_view: false,
            },
        ];
        let warnings = discover_directory_index_warnings(&files);
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].0, "posts/");
        assert!(warnings[0].1.contains("no index.md"));
    }
}