use serde_yaml::Mapping;

pub fn validate_translation_key_warning(fm: &Mapping, i18n_enabled: bool) -> Option<String> {
    if i18n_enabled {
        return None;
    }
    let key = fm
        .get(serde_yaml::Value::String("translation_key".into()))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())?;
    let _ = key;
    Some("translation_key has no effect without site.i18n.locales".to_string())
}