use once_cell::sync::OnceCell;
use ort::session::Session;
use ort::value::Tensor;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tokenizers::Tokenizer;

pub const DOC_PREFIX: &str = "検索文書: ";
pub const EMBED_DIM: i32 = 256;

#[derive(Debug, Clone)]
pub struct EmbedMeta {
    pub model_id: String,
    pub dim: i32,
    pub quant: String,
    pub model_sha256: String,
}

struct RuriRuntime {
    session: Session,
    tokenizer: Tokenizer,
    model_id: String,
    model_sha256: String,
}

static RUNTIME: OnceCell<Mutex<Option<RuriRuntime>>> = OnceCell::new();

pub fn model_dir(root: &str, model_root: &str, model_id: &str) -> PathBuf {
    Path::new(root).join(model_root).join(model_id)
}

pub fn model_available(root: &str, model_root: &str, model_id: &str) -> bool {
    let dir = model_dir(root, model_root, model_id);
    dir.join("onnx/model_quantized.onnx").is_file()
        && dir.join("tokenizer.json").is_file()
}

fn read_model_sha256(dir: &Path) -> String {
    std::fs::read_to_string(dir.join("version.txt"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn init_runtime(model_root: &Path, model_id: &str) -> Result<RuriRuntime, String> {
    let dir = model_root.join(model_id);
    let onnx_path = dir.join("onnx/model_quantized.onnx");
    let tokenizer_path = dir.join("tokenizer.json");
    let session = Session::builder()
        .map_err(|e| e.to_string())?
        .commit_from_file(&onnx_path)
        .map_err(|e| format!("failed to load ONNX model: {e}"))?;
    let tokenizer =
        Tokenizer::from_file(&tokenizer_path).map_err(|e| format!("tokenizer: {e}"))?;
    Ok(RuriRuntime {
        session,
        tokenizer,
        model_id: model_id.to_string(),
        model_sha256: read_model_sha256(&dir),
    })
}

fn runtime<'a>(
    model_root: &Path,
    model_id: &str,
) -> Result<std::sync::MutexGuard<'a, Option<RuriRuntime>>, String> {
    let cell = RUNTIME.get_or_init(|| Mutex::new(None));
    let mut guard = cell.lock().map_err(|e| e.to_string())?;
    let needs_init = match guard.as_ref() {
        None => true,
        Some(rt) => rt.model_id != model_id,
    };
    if needs_init {
        *guard = Some(init_runtime(model_root, model_id)?);
    }
    Ok(guard)
}

fn mean_pool_normalize(hidden: &[f32], seq_len: usize, hidden_size: usize, mask: &[i64]) -> Vec<f32> {
    let mut pooled = vec![0f32; hidden_size];
    let mut count = 0f32;
    for t in 0..seq_len {
        if mask.get(t).copied().unwrap_or(0) == 0 {
            continue;
        }
        count += 1.0;
        let offset = t * hidden_size;
        for d in 0..hidden_size {
            pooled[d] += hidden[offset + d];
        }
    }
    if count > 0.0 {
        for v in &mut pooled {
            *v /= count;
        }
    }
    let norm = pooled.iter().map(|v| v * v).sum::<f32>().sqrt();
    if norm > 0.0 {
        for v in &mut pooled {
            *v /= norm;
        }
    }
    pooled
}

fn embed_one(rt: &mut RuriRuntime, text: &str) -> Result<Vec<f32>, String> {
    let encoding = rt
        .tokenizer
        .encode(text, true)
        .map_err(|e| format!("tokenize: {e}"))?;
    let ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();
    let mask: Vec<i64> = encoding
        .get_attention_mask()
        .iter()
        .map(|&x| x as i64)
        .collect();
    let seq_len = ids.len();
    if seq_len == 0 {
        return Err("empty tokenization".to_string());
    }

    let batch = 1i64;
    let seq = seq_len as i64;
    let ids_tensor = Tensor::from_array(([batch, seq], ids.clone()))
        .map_err(|e| e.to_string())?;
    let mask_tensor = Tensor::from_array(([batch, seq], mask.clone()))
        .map_err(|e| e.to_string())?;

    let (dims, data): (Vec<usize>, Vec<f32>) = {
        let run_result = rt.session.run(ort::inputs![
            "input_ids" => ids_tensor,
            "attention_mask" => mask_tensor,
        ]);
        if let Ok(outputs) = run_result {
            let (shape, view) = outputs[0]
                .try_extract_tensor::<f32>()
                .map_err(|e| e.to_string())?;
            let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
            (dims, view.to_vec())
        } else {
            drop(run_result);
            let ids_only = Tensor::from_array(([batch, seq], ids))
                .map_err(|e| format!("tensor ids: {e}"))?;
            let outputs = rt
                .session
                .run(ort::inputs!["input_ids" => ids_only])
                .map_err(|e| format!("onnx run: {e}"))?;
            let (shape, view) = outputs[0]
                .try_extract_tensor::<f32>()
                .map_err(|e| e.to_string())?;
            let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
            (dims, view.to_vec())
        }
    };
    let data = data.as_slice();
    let hidden_size = dims.last().copied().unwrap_or(EMBED_DIM as usize);
    let seq_tokens = if dims.len() == 3 {
        dims[1]
    } else if dims.len() == 2 {
        if dims[0] == 1 {
            dims[1] / hidden_size
        } else {
            dims[0]
        }
    } else {
        seq_len
    };

    if dims.len() == 2 && dims[1] == hidden_size {
        let mut vec = data.to_vec();
        let norm = vec.iter().map(|v| v * v).sum::<f32>().sqrt();
        if norm > 0.0 {
            for v in &mut vec {
                *v /= norm;
            }
        }
        return Ok(vec);
    }

    Ok(mean_pool_normalize(data, seq_tokens, hidden_size, &mask))
}

pub fn embed_batch(
    root: &str,
    model_root: &str,
    model_id: &str,
    texts: &[String],
) -> Result<(Vec<Vec<f32>>, EmbedMeta), String> {
    let root_path = Path::new(root);
    let model_root_path = if Path::new(model_root).is_absolute() {
        PathBuf::from(model_root)
    } else {
        root_path.join(model_root)
    };
    let mut guard = runtime(&model_root_path, model_id)?;
    let rt = guard.as_mut().ok_or("embed runtime not initialized")?;
    let model_id_meta = rt.model_id.clone();
    let model_sha256 = rt.model_sha256.clone();
    let mut vectors = Vec::with_capacity(texts.len());
    for text in texts {
        vectors.push(embed_one(rt, text)?);
    }
    let meta = EmbedMeta {
        model_id: model_id_meta,
        dim: EMBED_DIM,
        quant: "q8".to_string(),
        model_sha256,
    };
    Ok((vectors, meta))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_model_root() -> Option<(String, String)> {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo = manifest.join("../..");
        let dir = repo.join("vendor/models/ruri-v3-30m/onnx/model_quantized.onnx");
        if dir.is_file() {
            Some((repo.to_string_lossy().into_owned(), "vendor/models".to_string()))
        } else {
            None
        }
    }

    #[test]
    fn long_document_embedding_matches_typescript_reference() {
        let Some((root, model_root)) = repo_model_root() else {
            return;
        };
        let text = format!(
            "{DOC_PREFIX}This article has enough body text to produce at least one search chunk when indexed in hybrid mode for native and TypeScript backend parity comparison."
        );
        let (vectors, _) =
            embed_batch(&root, &model_root, "ruri-v3-30m", &[text.clone()]).expect("embed");
        assert_eq!(vectors[0].len(), EMBED_DIM as usize);
        // Reference from @sorane/search on the same string (f32 cosine ≈ 1.0).
        assert!((vectors[0][0] - (-0.06388350576162338)).abs() < 1e-4);
    }

    #[test]
    fn matches_typescript_reference_embedding() {
        let Some((root, model_root)) = repo_model_root() else {
            return;
        };
        let text = format!(
            "{DOC_PREFIX}This is a parity probe sentence for Rust ONNX embeddings."
        );
        let (vectors, meta) =
            embed_batch(&root, &model_root, "ruri-v3-30m", &[text.clone()]).expect("embed");
        assert_eq!(vectors.len(), 1);
        assert_eq!(vectors[0].len(), EMBED_DIM as usize);
        assert_eq!(meta.dim, EMBED_DIM);
        let norm: f32 = vectors[0].iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-4);
        // Reference from @sorane/search (captured when model is present).
        assert!((vectors[0][0] - 0.008850927).abs() < 1e-4);
        assert!((vectors[0][4] - 0.1640235).abs() < 1e-3);
    }

}
