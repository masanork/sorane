# 空音 (sorane)

OKF-native static site generator. Markdown concepts with YAML frontmatter become a static site with machine-readable outputs for agents and search tools.

Japanese product name: **空音** (sorane). CLI and npm packages keep the `sorane` identifier.

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
npm install @sorane/search   # local sorane index / search + search page assets
npm install @sorane/font       # fonts.enabled in sorane.yaml
npm install mermaid            # build.diagrams.enabled (client mode)
```

If a command needs a missing package, sorane prints `npm install <pkg>` and may prompt to install (TTY). Use `--yes` on `index` / `search` to install non-interactively.

## New site (AI-assisted)

Copy [`template/site/`](template/site/) into your own GitHub repo. It includes **AGENTS.md** (Cursor, Claude Code, Antigravity, Codex, …), Cursor rules, and a sample CI workflow. See [AI onboarding](https://ssg.sorane.dev/ai-onboarding.html).

## CLI

```bash
npx @sorane/cli build [--cwd <dir>] [--clean] [--skip-c2pa]
npx @sorane/cli watch [--cwd <dir>] [--clean]
npx @sorane/cli validate [--cwd <dir>]
npx @sorane/cli index [--cwd <dir>] [--index <path>] [--force] [--yes]
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

空音 implements [Open Knowledge Format (OKF) v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md) with profiles `sorane-okf/0.1` through `0.3` (extended types and open-data metadata in `0.3`).

**Note:** profile string `sorane-okf/0.2` means “AI disclosure validation”, not “only OKF v0.2”. Upstream OKF v0.2 trust fields (`generated`, `verified`, `sources`, `status`, `stale_after`) are optional on every profile. When `timestamp` is absent, `generated.at` supplies the content date.

Supported concept types:

- `article` — blog posts
- `index` — site landing page

Required OKF field: `type`. Profile adds `title` for all supported types.

Example article with AI disclosure (`sorane-okf/0.2` profile) and OKF trust signals:

```yaml
---
type: article
title: Hello OKF
tags: [sorane]
profile: sorane-okf/0.2
generated: { by: human:author, at: 2025-01-01T00:00:00Z }
verified: { by: human:author, at: 2025-01-02T00:00:00Z }
digitalSourceType: compositeWithTrainedAlgorithmicMedia
aiDisclosureNote: Draft edited with an LLM; facts verified by the author.
---

Body markdown here.
```

See [OKF profile](https://ssg.sorane.dev/okf-profile.html) and [AI content disclosure](https://ssg.sorane.dev/ai-disclosure.html) for image provenance (IPTC XMP, C2PA) and `content/asset-provenance.yaml`.

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
| `okf/site.okfc` | OKFC site pack (SQLite + FTS5) | off |
| `okf/units/*.okfc` | OKFC content units (`build.okfc`) | off |
| `okf/registry.json` | Multi-OKFC index for agents | off |

## Font subsetting

bunsen WASM (allsorts) per-page WOFF2 subsetting. Configure in `sorane.yaml`:

```yaml
fonts:
  enabled: true
  cache_dir: .sorane/cache/fonts
  skip_key: noFontEmbedding
  roles:
    body: ["Noto Sans JP"]
  sources:
    "Noto Sans JP":
      source: assets/fonts/NotoSansJP-VF.ttf
      weight: "100 900"
```

Pages with `noFontEmbedding: true` in frontmatter use system fonts.

## Search

Search uses SQLite FTS5 trigram indexes. It needs no embedding model or external runtime.

```bash
npx @sorane/cli index --cwd examples/minimal --force   # update local .sorane/index.db
npx @sorane/cli search "OKF" --cwd examples/minimal   # search OKFC pack if present, else local index
npx @sorane/cli build --cwd examples/minimal --clean
```

`sorane index` maintains the local working index. `sorane build` regenerates browser search data from the current content, while OKFC is the pack created for sharing and distribution. `sorane search` uses the OKFC pack when present; pass `--prefer-index` to search the local working index.

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
  index: .sorane/index.db
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

The product site lives in `website/` and is built with 空音 itself:

```bash
npm run build -- --cwd website --clean
```

Cloudflare Pages deploys `website/dist` to **ssg.sorane.dev** on push to `main` (see `.github/workflows/pages.yml`). **sorane.dev** is reserved for the 空音 board (kototoi), not the SSG product site.

## Distribution

| Method | Status |
|--------|--------|
| `git clone` + `npm ci` | Available |
| `npx @sorane/cli` | Published (`@sorane/cli@0.5.0`) |
| GitHub Release tags | Available (`v0.5.0` — npm packs, SBOM/CBOM, SLSA provenance) |

Publish workspace packages (maintainers):

```bash
npm run publish:workspaces
```

Packages: `@sorane/cli`, `@sorane/core`, `@sorane/okf`, `@sorane/search`, `@sorane/font`.

## Roadmap

- SemVer tags and GitHub Releases (fonts tarball)
