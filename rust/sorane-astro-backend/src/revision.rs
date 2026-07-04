use serde_yaml::Value;

pub fn validate_revision_warnings(fm: &serde_yaml::Mapping) -> Vec<String> {
    let Some(raw) = fm.get(Value::String("revisions".into())) else {
        return Vec::new();
    };
    let Value::Sequence(seq) = raw else {
        return vec!["revisions must be an array".to_string()];
    };
    let mut warnings = Vec::new();
    let mut prev_key: Option<String> = None;
    for (i, item) in seq.iter().enumerate() {
        let Value::Mapping(entry) = item else {
            warnings.push(format!(
                "revisions[{i}] needs date (or updated) and summary (or note)"
            ));
            continue;
        };
        let date = entry
            .get(Value::String("date".into()))
            .or_else(|| entry.get(Value::String("updated".into())))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let summary = entry
            .get(Value::String("summary".into()))
            .or_else(|| entry.get(Value::String("note".into())))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let (Some(date), Some(_summary)) = (date, summary) else {
            warnings.push(format!(
                "revisions[{i}] needs date (or updated) and summary (or note)"
            ));
            continue;
        };
        let key = date.chars().take(10).collect::<String>();
        if key.len() < 10 || chrono_lite_parse(&key).is_none() {
            warnings.push(format!("revisions[{i}].date is not a valid date: {date}"));
        }
        if let Some(ref prev) = prev_key {
            if &key > prev {
                warnings.push(format!(
                    "revisions[{i}] is newer than the previous entry; list newest-first"
                ));
            }
        }
        prev_key = Some(key);
    }
    warnings
}

fn chrono_lite_parse(date: &str) -> Option<()> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let y: i32 = parts[0].parse().ok()?;
    let m: u32 = parts[1].parse().ok()?;
    let d: u32 = parts[2].parse().ok()?;
    if (1..=12).contains(&m) && (1..=31).contains(&d) && y > 0 {
        Some(())
    } else {
        None
    }
}