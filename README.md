# sorane

OKF-native static site generator. Markdown concepts with YAML frontmatter become a static site with machine-readable outputs for agents and search tools.

- **Product site:** https://ssg.sorane.dev/ (built from `website/` in this repo)

## Requirements

- Node.js >= 23.6 (TypeScript sources run natively; no compile step)

## Quick start

```bash
npm install
npm test
npm run build -- --cwd examples/minimal --clean
npm run stats                  # project size / test ratio snapshot
```

Or install the CLI from npm:

```bash
npm install @sorane/cli
npx sorane build --cwd ./my-site --clean
```

Optional feature packages (install when needed):

```bash
npm install @sorane/search   # sorane index / search + search page assets
npm install @sorane/font       # fonts.enabled in sorane.yaml
npm install mermaid            # build.diagrams.enabled (client mode)
npm install @sorane/astro      # Astro integration for OKF / llms.txt / catalog outputs
```

If a command needs a missing package, sorane prints `npm install <pkg>` and may prompt to install (TTY). Use `--yes` on `index` / `search` to install non-interactively.

## New site (AI-assisted)

Copy [`template/site/`](template/site/) into your own GitHub repo. It includes **AGENTS.md** (Cursor, Claude Code, Antigravity, Codex, …), Cursor rules, and a sample CI workflow. See [AI onboarding](https://ssg.sorane.dev/ai-onboarding.html).

## CLI

```bash
npx @sorane/cli build [--cwd <dir>] [--clean] [--watch] [--skip-c2pa]
npx @sorane/cli watch [--cwd <dir>] [--clean]
npx @sorane/cli validate [--cwd <dir>]
npx @sorane/cli migrate [--cwd <dir>] [--dry-run] [--bump-profile 0.2|0.3]
npx @sorane/cli index [--cwd <dir>] [--force] [--yes]
npx @sorane/cli search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--json] [--yes]
```

Site projects keep content in a separate directory and configure the build with `sorane.yaml`.

### Presets

```yaml
preset: blog        # lightweight SSG (default behaviour if omitted)
preset: okf-site    # full machine-readable outputs, diagrams, archives/tags
preset: gov         # okf-site + strict validate quality gates
```

See [configuration](https://ssg.sorane.dev/configuration.html#プリセット) on ssg.sorane.dev.

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

See [AI content disclosure](https://ssg.sorane.dev/ai-disclosure.html) for image provenance (IPTC XMP, C2PA) and `content/asset-provenance.yaml`.

## Build outputs

Lite defaults (no `preset:` or `preset: blog`) emit HTML, `feed.xml`, `sitemap.xml`, and `robots.txt`. Full OKF/agent outputs require `preset: okf-site` or explicit `build.outputs`:

| Path | Purpose | Lite default |
|---|---|---|
| `*.html` | Human-readable pages | on |
| `feed.xml` / `sitemap.xml` / `robots.txt` | Syndication / crawlers | on |
| `*.md` | OKF native alternate source | off |
| `catalog.jsonld` | schema.org site catalog | off |
| `llms.txt` | LLM site guide | off |
| `okf/bundle.tar.gz` | OKF bundle `{type}/{slug}.md` | off |

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

Search uses two UI layers:

- **Header search** (all pages after `sorane index`) — compact box, no type facet
- **Dedicated page** (`content/search.md` with `view: search`) — full UI with OKF type facets, intro copy, `SearchAction` JSON-LD target

See `examples/minimal/content/search.md`. Header-only sites can omit `search.md`; open-data / gov sites usually keep it.

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

Cloudflare Pages deploys `website/dist` to **ssg.sorane.dev** on push to `main` (see `.github/workflows/pages.yml`). **sorane.dev** is reserved for the 空音 board (kototoi), not the SSG product site.

## Distribution

| Method | Status |
|--------|--------|
| `git clone` + `npm ci` | Available |
| `npx @sorane/cli` | Published (`@sorane/cli@0.4.0`) |
| GitHub Release tags | Planned (`v0.2.0` + fonts tarball) |

Publish workspace packages (maintainers):

```bash
npm run publish:workspaces
```

Packages: `@sorane/cli`, `@sorane/core`, `@sorane/okf`, `@sorane/search`, `@sorane/font`.

## Astro integration PoC

`@sorane/astro` lets Astro own rendering while sorane emits OKF and agent-readable publishing artifacts after `astro build`:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import soraneAstro from "@sorane/astro";

export default defineConfig({
  integrations: [
    soraneAstro({
      site: {
        title: "My Astro Site",
        description: "Astro-rendered, sorane-readable",
        baseUrl: "https://example.dev",
      },
      collections: { posts: "blog" },
    }),
  ],
});
```

The PoC scans `src/content/**/*.md(x)` for OKF frontmatter and emits `catalog.jsonld`, `llms.txt`, and `okf/bundle.tar.gz` into Astro's output directory. The package boundary is file-based so OKF parsing, validation, bundle creation, and search indexing can move to Rust/WASM or a Rust CLI without changing Astro routes.

## Roadmap

- SemVer tags and GitHub Releases (fonts tarball)
- Astro integration hardening: content collection loader, validation hook, search assets
- Rust-native OKF parser/validator and bundle/search backends behind the Astro integration boundary
