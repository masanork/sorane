# sorane

OKF-native static site generator. Markdown concepts with YAML frontmatter become a static site with machine-readable outputs for agents and search tools.

## Requirements

- Node.js >= 23.6

## Quick start

```bash
npm install
npm test
npm run build -- --cwd examples/minimal --clean
```

## CLI

```bash
npx sorane build [--cwd <dir>] [--clean]
npx sorane validate [--cwd <dir>]
npx sorane migrate [--cwd <dir>] [--dry-run]
npx sorane index [--cwd <dir>] [--force]
npx sorane search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--json]
```

Site projects keep content in a separate directory and configure the build with `sorane.yaml`.

## OKF profile

sorane implements [Open Knowledge Format (OKF) v0.1](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) with profile `sorane-okf/0.1`.

Supported concept types in v0.1:

- `article` — blog posts
- `index` — site landing page

Required OKF field: `type`. Profile adds `title` for all supported types.

Example article:

```yaml
---
type: article
title: Hello OKF
timestamp: 2025-01-01T00:00:00Z
tags: [sorane]
profile: sorane-okf/0.1
---

Body markdown here.
```

## Build outputs

| Path | Purpose |
|---|---|
| `*.html` | Human-readable pages |
| `*.md` | OKF native alternate source |
| `catalog.jsonld` | DCAT-style catalog |
| `llms.txt` | LLM site guide |
| `sitemap.xml` | URL index |
| `okf/bundle.tar.gz` | OKF bundle `{type}/{slug}.md` |

## Font subsetting

bunsen WASM (allsorts) per-page WOFF2 subsetting. Configure in `sorane.yaml`:

```yaml
fonts:
  enabled: true
  family: Sorane-NotoSansJP
  source: assets/fonts/NotoSansJP-VF.ttf
  skip_key: noFontEmbedding
```

Pages with `noFontEmbedding: true` in frontmatter use system fonts.

## Search (FTS)

Phase 1: SQLite FTS5 trigram index at `.sorane/index.db` (configurable via `search.index` in `sorane.yaml`).

```bash
npx sorane index --cwd examples/minimal
npx sorane search "OKF" --cwd examples/minimal
```

## Roadmap

- Embeddings + hybrid search (port from mrlgss `rag/`)
- Astro theme layer (reads sorane build output)