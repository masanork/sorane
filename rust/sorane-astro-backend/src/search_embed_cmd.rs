use crate::search_embed::{embed_batch, model_available, EmbedMeta};
use serde::{Deserialize, Serialize};

const SCHEMA_VERSION: i32 = 1;

#[derive(Debug, Deserialize)]
pub struct SearchEmbedInput {
    pub schema_version: i32,
    pub root: String,
    #[serde(rename = "modelRoot", default = "default_model_root")]
    pub model_root: String,
    #[serde(rename = "modelId", default = "default_model_id")]
    pub model_id: String,
    pub texts: Vec<String>,
}

fn default_model_root() -> String {
    "vendor/models".to_string()
}

fn default_model_id() -> String {
    "ruri-v3-30m".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchEmbedOutput {
    pub schema_version: i32,
    pub vectors: Vec<Vec<f32>>,
    #[serde(rename = "modelId")]
    pub model_id: String,
    pub dim: i32,
    pub quant: String,
    #[serde(rename = "modelSha256")]
    pub model_sha256: String,
}

pub fn run_search_embed_json(input_json: &str) -> Result<String, String> {
    let input: SearchEmbedInput =
        serde_json::from_str(input_json).map_err(|e| format!("invalid input JSON: {e}"))?;
    if input.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "unsupported schema_version: {}",
            input.schema_version
        ));
    }
    if input.texts.is_empty() {
        return Err("texts must not be empty".to_string());
    }
    if !model_available(&input.root, &input.model_root, &input.model_id) {
        return Err(format!(
            "hybrid model not found at {}/{}/{}/onnx/model_quantized.onnx",
            input.root, input.model_root, input.model_id
        ));
    }

    let (vectors, EmbedMeta {
        model_id,
        dim,
        quant,
        model_sha256,
    }) = embed_batch(
        &input.root,
        &input.model_root,
        &input.model_id,
        &input.texts,
    )?;

    let output = SearchEmbedOutput {
        schema_version: SCHEMA_VERSION,
        vectors,
        model_id,
        dim,
        quant,
        model_sha256,
    };

    serde_json::to_string(&output).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn rejects_empty_texts() {
        let input = serde_json::json!({
            "schema_version": 1,
            "root": "/tmp",
            "texts": [],
        });
        let err = run_search_embed_json(&input.to_string()).unwrap_err();
        assert!(err.contains("texts must not be empty"));
    }

    #[test]
    fn rejects_missing_model() {
        let dir = std::env::temp_dir().join(format!("sorane-embed-cmd-{}", std::process::id()));
        let input = serde_json::json!({
            "schema_version": 1,
            "root": dir.to_string_lossy(),
            "texts": ["probe"],
        });
        let err = run_search_embed_json(&input.to_string()).unwrap_err();
        assert!(err.contains("hybrid model not found"));
    }

    fn repo_model_root() -> Option<(String, String)> {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo = manifest.join("../..");
        let onnx = repo.join("vendor/models/ruri-v3-30m/onnx/model_quantized.onnx");
        if onnx.is_file() {
            Some((repo.to_string_lossy().into_owned(), "vendor/models".to_string()))
        } else {
            None
        }
    }

    #[test]
    fn embeds_texts_via_json_contract() {
        let Some((root, model_root)) = repo_model_root() else {
            return;
        };
        let input = serde_json::json!({
            "schema_version": 1,
            "root": root,
            "modelRoot": model_root,
            "modelId": "ruri-v3-30m",
            "texts": ["検索クエリ: hybrid probe"],
        });
        let out = run_search_embed_json(&input.to_string()).expect("embed");
        let parsed: SearchEmbedOutput = serde_json::from_str(&out).expect("parse");
        assert_eq!(parsed.schema_version, SCHEMA_VERSION);
        assert_eq!(parsed.vectors.len(), 1);
        assert_eq!(parsed.vectors[0].len(), parsed.dim as usize);
        assert_eq!(parsed.quant, "q8");
    }
}