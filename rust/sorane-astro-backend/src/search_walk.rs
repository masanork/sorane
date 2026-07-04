use std::fs;
use std::path::{Path, PathBuf};

/// Collect `.md` files under `content_dir` as `(rel_path, source)` pairs.
pub fn walk_markdown(content_dir: &Path) -> Result<Vec<(String, String)>, String> {
    if !content_dir.is_dir() {
        return Err(format!("content directory not found: {}", content_dir.display()));
    }
    let mut out: Vec<(String, String)> = Vec::new();
    walk_dir(content_dir, content_dir, &mut out)?;
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

fn walk_dir(root: &Path, dir: &Path, out: &mut Vec<(String, String)>) -> Result<(), String> {
    let mut names: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| format!("read_dir {}: {e}", dir.display()))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    names.sort();
    for path in names {
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            walk_dir(root, &path, out)?;
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            let rel = path
                .strip_prefix(root)
                .map_err(|_| format!("strip_prefix failed for {}", path.display()))?
                .to_string_lossy()
                .replace('\\', "/");
            let source = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            out.push((rel, source));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collects_md_files_recursively() {
        let dir = std::env::temp_dir().join(format!("sorane-walk-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("posts")).unwrap();
        fs::write(dir.join("posts/a.md"), "---\ntype: article\ntitle: A\n---\n\nbody\n").unwrap();
        fs::write(dir.join("index.md"), "---\ntype: index\ntitle: I\n---\n\nhome\n").unwrap();
        let files = walk_markdown(&dir).expect("walk");
        assert_eq!(files.len(), 2);
        assert!(files.iter().any(|(r, _)| r == "index.md"));
        assert!(files.iter().any(|(r, _)| r == "posts/a.md"));
        let _ = fs::remove_dir_all(&dir);
    }
}