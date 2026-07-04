use regex::Regex;
use std::sync::LazyLock;

static SLUG_STRIP_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^\w぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ-]").expect("slug strip re"));

pub fn slugify_heading(text: &str) -> String {
    let mut base = text.trim().to_lowercase();
    for ch in ['*', '_', '`', '~'] {
        base = base.replace(ch, "");
    }
    base = base.split_whitespace().collect::<Vec<_>>().join("-");
    base = SLUG_STRIP_RE.replace_all(&base, "").to_string();
    while base.contains("--") {
        base = base.replace("--", "-");
    }
    base = base.trim_matches('-').to_string();
    if base.is_empty() {
        "section".to_string()
    } else {
        base
    }
}

pub struct SlugLedger {
    used: std::collections::HashMap<String, usize>,
}

impl SlugLedger {
    pub fn new() -> Self {
        Self {
            used: std::collections::HashMap::new(),
        }
    }

    pub fn next(&mut self, text: &str) -> String {
        let base = slugify_heading(text);
        let count = *self.used.get(&base).unwrap_or(&0);
        self.used.insert(base.clone(), count + 1);
        if count == 0 {
            base
        } else {
            format!("{base}-{}", count + 1)
        }
    }
}

impl Default for SlugLedger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deduplicates_headings() {
        let mut ledger = SlugLedger::new();
        assert_eq!(ledger.next("Hello"), "hello");
        assert_eq!(ledger.next("Hello"), "hello-2");
    }
}