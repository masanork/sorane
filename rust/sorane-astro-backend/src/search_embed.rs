use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::io::Write;

#[derive(Debug, Clone)]
pub struct EmbedMeta {
    pub model_id: String,
    pub dim: i32,
    pub quant: String,
    pub model_sha256: String,
}

#[derive(Debug, Deserialize)]
struct EmbedResponse {
    vectors: Vec<Vec<f64>>,
    #[serde(rename = "modelId")]
    model_id: String,
    dim: i32,
    quant: String,
    #[serde(rename = "modelSha256")]
    model_sha256: String,
}

pub fn model_dir(root: &str, model_root: &str, model_id: &str) -> PathBuf {
    Path::new(root).join(model_root).join(model_id)
}

pub fn model_available(root: &str, model_root: &str, model_id: &str) -> bool {
    model_dir(root, model_root, model_id).is_dir()
}

fn resolve_embed_script(root: &str) -> Option<PathBuf> {
    let root = Path::new(root);
    let candidates = [
        root.join("node_modules/@sorane/search/scripts/embed-batch.mjs"),
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/search/scripts/embed-batch.mjs"),
    ];
    for path in candidates {
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

pub fn embed_batch(
    root: &str,
    model_root: &str,
    model_id: &str,
    texts: &[String],
) -> Result<(Vec<Vec<f32>>, EmbedMeta), String> {
    let script = resolve_embed_script(root)
        .ok_or_else(|| "embed-batch.mjs not found (@sorane/search scripts)".to_string())?;
    let payload = serde_json::json!({
        "modelRoot": model_root,
        "modelId": model_id,
        "texts": texts,
    });
    let mut child = Command::new("node")
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn node for embeddings: {e}"))?;
    {
        let stdin = child.stdin.as_mut().ok_or("node stdin unavailable")?;
        stdin
            .write_all(payload.to_string().as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("embedding bridge failed: {}", stderr.trim()));
    }
    let resp: EmbedResponse =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("invalid embed JSON: {e}"))?;
    let vectors = resp
        .vectors
        .into_iter()
        .map(|row| row.into_iter().map(|v| v as f32).collect())
        .collect();
    Ok((
        vectors,
        EmbedMeta {
            model_id: resp.model_id,
            dim: resp.dim,
            quant: resp.quant,
            model_sha256: resp.model_sha256,
        },
    ))
}