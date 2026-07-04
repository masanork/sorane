use crate::search_build::{build_search_index, SearchBuildConfig};
use crate::search_walk::walk_markdown;
use serde::{Deserialize, Serialize};
use std::path::Path;

const SCHEMA_VERSION: i32 = 1;

#[derive(Debug, Deserialize)]
pub struct SearchIndexInput {
    pub schema_version: i32,
    pub root: String,
    #[serde(rename = "contentDir")]
    pub content_dir: String,
    #[serde(rename = "indexPath")]
    pub index_path: String,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub hybrid: bool,
    #[serde(rename = "modelRoot", default = "default_model_root")]
    pub model_root: String,
    #[serde(rename = "modelId", default = "default_model_id")]
    pub model_id: String,
}

fn default_model_root() -> String {
    "vendor/models".to_string()
}

fn default_model_id() -> String {
    "ruri-v3-30m".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchIndexOutput {
    pub schema_version: i32,
    pub added: usize,
    pub changed: usize,
    pub removed: usize,
    pub unchanged: usize,
    pub chunks: usize,
    pub fts: usize,
    pub vec: usize,
    pub mode: String,
    #[serde(rename = "modelMissing")]
    pub model_missing: bool,
}

pub fn run_search_index_json(input_json: &str) -> Result<String, String> {
    let input: SearchIndexInput =
        serde_json::from_str(input_json).map_err(|e| format!("invalid input JSON: {e}"))?;
    if input.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "unsupported schema_version: {}",
            input.schema_version
        ));
    }

    let root = Path::new(&input.root);
    let content_dir = Path::new(&input.content_dir);
    let index_path = if Path::new(&input.index_path).is_absolute() {
        input.index_path.clone()
    } else {
        root.join(&input.index_path).to_string_lossy().into_owned()
    };

    let md_files = walk_markdown(content_dir)?;
    let md_refs: Vec<(&str, &str)> = md_files
        .iter()
        .map(|(rel, src)| (rel.as_str(), src.as_str()))
        .collect();

    let cfg = SearchBuildConfig {
        root: &input.root,
        index_path: &index_path,
        force: input.force,
        hybrid: input.hybrid,
        model_root: &input.model_root,
        model_id: &input.model_id,
    };

    let outcome = build_search_index(&md_refs, &cfg)?;

    if outcome.model_missing {
        eprintln!(
            "[sorane/native-index] hybrid model not found at {}/{}; indexing FTS-only",
            root.join(&input.model_root).display(),
            input.model_id
        );
    }

    let mode = if outcome.hybrid {
        "hybrid".to_string()
    } else {
        "fts-only".to_string()
    };

    let output = SearchIndexOutput {
        schema_version: SCHEMA_VERSION,
        added: outcome.added,
        changed: outcome.changed,
        removed: outcome.removed,
        unchanged: outcome.unchanged,
        chunks: outcome.chunks,
        fts: outcome.fts,
        vec: outcome.vec,
        mode,
        model_missing: outcome.model_missing,
    };

    serde_json::to_string(&output).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn indexes_content_dir_via_json_contract() {
        let dir = std::env::temp_dir().join(format!("sorane-index-cmd-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let content = dir.join("content");
        fs::create_dir_all(&content).unwrap();
        fs::write(
            content.join("page.md"),
            "---\ntype: article\ntitle: Page\n---\n\nEnough text to form a search chunk for native index command testing.\n",
        )
        .unwrap();
        let index_path = dir.join(".sorane/index.db");
        let input = serde_json::json!({
            "schema_version": 1,
            "root": dir.to_string_lossy(),
            "contentDir": content.to_string_lossy(),
            "indexPath": index_path.to_string_lossy(),
            "force": true,
            "hybrid": false,
        });
        let out = run_search_index_json(&input.to_string()).expect("index");
        let parsed: SearchIndexOutput = serde_json::from_str(&out).expect("parse");
        assert_eq!(parsed.chunks, parsed.fts);
        assert_eq!(parsed.mode, "fts-only");
        assert!(index_path.is_file());
        let _ = fs::remove_dir_all(&dir);
    }
}