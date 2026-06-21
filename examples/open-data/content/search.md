---
type: article
title: Search
view: search
profile: sorane-okf/0.3
excludeFromList: true
---

Search this demo site by keyword. Use the **種別** facet to limit results to datasets, reference pages, glossaries, or FAQ.

CLI examples (after `sorane index --force`):

```bash
sorane search "CSV" --cwd . --type dataset
sorane search "license" --cwd . --type faq
sorane search "stop_id" --cwd . --type reference
```

Dataset chunks also carry tags such as `format:csv` and `license:cc-by-4.0` for `sorane search --tag format:csv`.