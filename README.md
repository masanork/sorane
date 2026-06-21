# sorane

OKF-native static site generator. Markdown concepts with YAML frontmatter become a static site with machine-readable outputs for agents and search tools.

- **Product site:** https://sorane.dev/ (built from `website/` in this repo; mirror at https://ssg.sorane.dev/)

## Requirements

- Node.js >= 23.6 (TypeScript sources run natively; no compile step)

## Quick start

```bash
npm install
npm test
npm run build -- --cwd examples/minimal --clean
npm run stats                  # project size / test ratio snapshot
```

Or install the CLI from npm (after publish):

```bash
npx @sorane/cli build --cwd ./my-site --clean
```

## New site (AI-assisted)

Copy [`template/site/`](template/site/) into your own GitHub repo. It includes **AGENTS.md** (Cursor, Claude Code, Antigravity, Codex, …), Cursor rules, and a sample CI workflow. See [AI onboarding](https://sorane.dev/ai-onboarding.html).

## CLI

```bash
npx @sorane/cli build [--cwd <dir>] [--clean] [--watch] [--skip-c2pa]
npx @sorane/cli watch [--cwd <dir>] [--clean]
npx @sorane/cli validate [--cwd <dir>]
npx @sorane/cli migrate [--cwd <dir>] [--dry-run] [--bump-profile 0.2|0.3]
npx @sorane/cli index [--cwd <dir>] [--force]
npx @sorane/cli search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--json]
```

Site projects keep content in a separate directory and configure the build with `sorane.yaml`.

## OKF profile

sorane implements [Open Knowledge Format (OKF)](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) with profiles `sorane-okf/0.1` through `0.3` (extended types and open-data metadata in `0.3`).

Supported concept types:

- `article` — blog posts
- `index` — site landing page

Required OKF field: `type`. Profile adds `title` for all supported types.

Example article with AI disclosure (`0.2`):

```yaml
---
type: article
title: Hello OKF
timestamp: 2025-01-01T00:00:00Z
tags: [sorane]
profile: sorane-okf/0.2
digitalSourceType: compositeWithTrainedAlgorithmicMedia
aiDisclosureNote: Draft edited with an LLM; facts verified by the author.
---

Body markdown here.
```

See [AI content disclosure](https://sorane.dev/ai-disclosure.html) for image provenance (IPTC XMP, C2PA) and `content/asset-provenance.yaml`.

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

## Search

SQLite FTS5 trigram search is the default (lightweight, no model). Optional **hybrid** mode (experimental) adds ruri-v3-30m vectors for natural-language queries.

```bash
npx @sorane/cli index --cwd examples/minimal --force
npx @sorane/cli search "OKF" --cwd examples/minimal
npx @sorane/cli build --cwd examples/minimal --clean
```

Hybrid (experimental):

```bash
npm run fetch-model
npx @sorane/cli index --cwd examples/minimal --force --hybrid
```

Add a search page with `view: search` in frontmatter (see `examples/minimal/content/search.md`).

**OKF 0.3 open-data demo** (`dataset`, `reference`, `glossary`, `faq`, search facets):

```bash
npx @sorane/cli validate --cwd examples/open-data --json
npx @sorane/cli index --cwd examples/open-data --force
npx @sorane/cli build --cwd examples/open-data --clean
```

See [examples/open-data/README.md](examples/open-data/README.md).

```yaml
search:
  index: .sorane/index.db          # FTS (default)
  # mode: hybrid                   # experimental; needs model + R2 for Pages
```

## Image metadata and C2PA

Optional passes for raster images under `static/` and inline Markdown images:

```yaml
build:
  image_metadata:
    enabled: false
    exiftool: exiftool
    manifest: asset-provenance.yaml
  c2pa:
    enabled: false
    embed: true
    binary: c2patool
```

Requires `content/asset-provenance.yaml` and external tools (`exiftool`, `c2patool`) when enabled. Use `sorane build --skip-c2pa` to omit signing in CI snapshots.

## Docs site

The product site lives in `website/` and is built with sorane itself:

```bash
npm run build -- --cwd website --clean
```

Cloudflare Pages deploys `website/dist` to **sorane.dev** on push to `main` (see `.github/workflows/pages.yml`). **ssg.sorane.dev** remains as a secondary hostname on the same deployment.

## Distribution

| Method | Status |
|--------|--------|
| `git clone` + `npm ci` | Available |
| `npx @sorane/cli` | Published (`@sorane/cli@0.2.8`) |
| GitHub Release tags | Planned (`v0.2.0` + fonts tarball) |

Publish workspace packages (maintainers):

```bash
npm run publish:workspaces
```

Packages: `@sorane/cli`, `@sorane/core`, `@sorane/okf`, `@sorane/search`, `@sorane/font`.

## Roadmap

- SemVer tags and GitHub Releases (fonts tarball)
- Astro theme layer (reads sorane build output)