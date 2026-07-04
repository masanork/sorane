use serde::Deserialize;
use std::collections::BTreeMap;

pub const DEFAULT_LOCALE_ID: &str = "default";

#[derive(Debug, Clone, Deserialize)]
pub struct BackendLocaleSpec {
    pub lang: String,
    #[serde(rename = "pathPrefix")]
    pub path_prefix: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BackendSiteI18n {
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub locales: BTreeMap<String, BackendLocaleSpec>,
}

#[derive(Debug, Clone)]
pub struct I18nContext {
    pub enabled: bool,
    pub default_lang: String,
    pub locales: BTreeMap<String, BackendLocaleSpec>,
    pub prefix_to_locale: BTreeMap<String, String>,
}

pub fn resolve_i18n_context(site_lang: &str, i18n: &Option<BackendSiteI18n>) -> I18nContext {
    let Some(raw) = i18n.as_ref().filter(|i| !i.locales.is_empty()) else {
        return I18nContext {
            enabled: false,
            default_lang: site_lang.to_string(),
            locales: BTreeMap::new(),
            prefix_to_locale: BTreeMap::new(),
        };
    };
    let mut locales = BTreeMap::new();
    let mut prefix_to_locale = BTreeMap::new();
    for (id, spec) in &raw.locales {
        let prefix = spec.path_prefix.trim();
        if !prefix.is_empty() && !prefix.contains('/') {
            locales.insert(id.clone(), spec.clone());
            prefix_to_locale.insert(prefix.to_string(), id.clone());
        }
    }
    let default_lang = raw
        .default
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(site_lang)
        .to_string();
    I18nContext {
        enabled: !locales.is_empty(),
        default_lang,
        locales,
        prefix_to_locale,
    }
}

pub fn locale_id_from_rel_path(rel_path: &str, ctx: &I18nContext) -> String {
    if !ctx.enabled {
        return DEFAULT_LOCALE_ID.to_string();
    }
    let norm = rel_path.replace('\\', "/");
    let first = norm.split('/').next().unwrap_or("");
    if first.is_empty() {
        return DEFAULT_LOCALE_ID.to_string();
    }
    ctx.prefix_to_locale
        .get(first)
        .cloned()
        .unwrap_or_else(|| DEFAULT_LOCALE_ID.to_string())
}

pub fn logical_rel_path(rel_path: &str, ctx: &I18nContext) -> String {
    let norm = rel_path.replace('\\', "/");
    if !ctx.enabled {
        return norm;
    }
    let locale_id = locale_id_from_rel_path(&norm, ctx);
    if locale_id == DEFAULT_LOCALE_ID {
        return norm;
    }
    let prefix = &ctx.locales[&locale_id].path_prefix;
    if norm == *prefix {
        return "index.md".to_string();
    }
    if let Some(rest) = norm.strip_prefix(&format!("{prefix}/")) {
        return rest.to_string();
    }
    norm
}

pub fn translation_group_key(
    rel_path: &str,
    translation_key: Option<&str>,
    ctx: &I18nContext,
) -> String {
    if let Some(key) = translation_key.map(str::trim).filter(|s| !s.is_empty()) {
        return format!("key:{key}");
    }
    let logical = logical_rel_path(rel_path, ctx);
    let stem = logical
        .trim_end_matches(".mdx")
        .trim_end_matches(".md");
    format!("path:{stem}")
}

fn missing_sibling_message(target_locale: &str, ctx: &I18nContext) -> String {
    if target_locale == DEFAULT_LOCALE_ID {
        return format!(
            "translation_key missing sibling for default locale ({})",
            ctx.default_lang
        );
    }
    if let Some(spec) = ctx.locales.get(target_locale) {
        return format!(
            "translation_key missing sibling for locale {} ({})",
            target_locale, spec.lang
        );
    }
    format!("translation_key missing sibling for locale {target_locale}")
}

pub struct I18nEntry {
    pub rel_path: String,
    pub translation_key: Option<String>,
}

/// Mirrors `validateI18nWarnings` (warning messages keyed by rel path).
pub fn validate_i18n_warnings(
    entries: &[I18nEntry],
    ctx: &I18nContext,
) -> BTreeMap<String, Vec<String>> {
    let mut by_file: BTreeMap<String, Vec<String>> = BTreeMap::new();

    if !ctx.enabled {
        for entry in entries {
            if entry.translation_key.is_some() {
                push_warning(
                    &mut by_file,
                    &entry.rel_path,
                    "translation_key has no effect without site.i18n.locales",
                );
            }
        }
        return by_file;
    }

    let mut groups: BTreeMap<
        String,
        BTreeMap<String, (String, Option<String>)>,
    > = BTreeMap::new();

    for entry in entries {
        let locale_id = locale_id_from_rel_path(&entry.rel_path, ctx);
        let group_key = translation_group_key(
            &entry.rel_path,
            entry.translation_key.as_deref(),
            ctx,
        );
        let by_locale = groups.entry(group_key).or_default();
        if let Some((existing_rel, _)) = by_locale.get(&locale_id) {
            push_warning(
                &mut by_file,
                &entry.rel_path,
                &format!("duplicate translation group entry in locale {locale_id} ({existing_rel})"),
            );
        }
        by_locale.insert(
            locale_id,
            (entry.rel_path.clone(), entry.translation_key.clone()),
        );
    }

    let configured_locales: Vec<String> = std::iter::once(DEFAULT_LOCALE_ID.to_string())
        .chain(ctx.locales.keys().cloned())
        .collect();

    for by_locale in groups.values() {
        let explicit_keys: Vec<String> = by_locale
            .values()
            .filter_map(|(_, key)| key.as_ref().map(|k| k.trim().to_string()))
            .filter(|k| !k.is_empty())
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();

        if explicit_keys.len() > 1 {
            let joined = {
                let mut keys = explicit_keys;
                keys.sort();
                keys.join(", ")
            };
            for (rel, _) in by_locale.values() {
                push_warning(
                    &mut by_file,
                    rel,
                    &format!("translation_key mismatch within group ({joined})"),
                );
            }
        }

        let uses_explicit = by_locale.values().any(|(_, key)| key.is_some());
        if !uses_explicit {
            continue;
        }

        for (locale_id, (rel, _)) in by_locale {
            for target in &configured_locales {
                if target == locale_id || by_locale.contains_key(target) {
                    continue;
                }
                push_warning(
                    &mut by_file,
                    rel,
                    &missing_sibling_message(target, ctx),
                );
            }
        }
    }

    let mut by_logical: BTreeMap<
        String,
        Vec<(String, Option<String>, String)>,
    > = BTreeMap::new();
    for entry in entries {
        let logical = logical_rel_path(&entry.rel_path, ctx)
            .trim_end_matches(".mdx")
            .trim_end_matches(".md")
            .to_string();
        let group_key = translation_group_key(
            &entry.rel_path,
            entry.translation_key.as_deref(),
            ctx,
        );
        by_logical
            .entry(logical)
            .or_default()
            .push((
                entry.rel_path.clone(),
                entry.translation_key.clone(),
                group_key,
            ));
    }

    for entries in by_logical.values() {
        if entries.len() < 2 {
            continue;
        }
        let group_keys: std::collections::BTreeSet<&str> =
            entries.iter().map(|(_, _, g)| g.as_str()).collect();
        if group_keys.len() <= 1 {
            continue;
        }
        let with_key: Vec<_> = entries.iter().filter(|(_, k, _)| k.is_some()).collect();
        let without_key: Vec<_> = entries.iter().filter(|(_, k, _)| k.is_none()).collect();
        if with_key.is_empty() || without_key.is_empty() {
            continue;
        }
        let keyed = with_key
            .iter()
            .map(|(rel, _, _)| rel.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        let plain = without_key
            .iter()
            .map(|(rel, _, _)| rel.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        for (rel, _, _) in &with_key {
            push_warning(
                &mut by_file,
                rel,
                &format!("translation_key set but mirrored sibling lacks matching key ({plain})"),
            );
        }
        for (rel, _, _) in &without_key {
            push_warning(
                &mut by_file,
                rel,
                &format!("mirrored locale sibling uses translation_key; set the same key ({keyed})"),
            );
        }
    }

    by_file
}

fn push_warning(by_file: &mut BTreeMap<String, Vec<String>>, rel: &str, message: &str) {
    by_file
        .entry(rel.to_string())
        .or_default()
        .push(message.to_string());
}