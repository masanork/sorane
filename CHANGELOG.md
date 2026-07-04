# Changelog

All notable changes to sorane are documented here. Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Native hybrid search embeddings** — `rust/sorane-astro-backend/src/search_ruri.rs` runs ruri-v3-30m via `ort` + `tokenizers` (no Node `embed-batch` bridge). Parity unit test against `@sorane/search` reference vectors.
- **Hybrid native parity test** — `tests/astro-backend-native-parity.test.ts` compares TS and native hybrid `assets/search-index.json` (chunks/model/schema; embedding cosine ≥ 0.95 on int8 vectors). CI runs `npm run fetch-model`.
- **Astro TS fallback CI guard** — job `astro-ts-fallback` runs `tests/astro-backend-ts-fallback.test.ts` without building the native CLI.
- **Native `sorane index`** — `sorane-astro-backend index` subcommand; `@sorane/cli` `index` prefers native when built (`SORANE_INDEX_NATIVE=0` opts out).
- **Native `sorane search` query embed** — `sorane-astro-backend embed` subcommand; `@sorane/cli` `search` prefers native ONNX for hybrid query vectors when built (`SORANE_EMBED_NATIVE=0` opts out).
- **Astro TS search fallback** — `packages/astro/src/search-backend.ts` prefers native `index` when the CLI is built (`SORANE_INDEX_NATIVE=0` opts out); companion assets use ONNX presence for hybrid vendoring.

### Changed

- Documented native CLI env vars (`SORANE_INDEX_NATIVE`, `SORANE_EMBED_NATIVE`, …) in `website/content/cli.md` and `website/content/astro-integration.md`.
- Documented WASM FTS-only hybrid policy and Astro validation ownership in `design/astro-rust-backend.md` (integration layer = TS `validateSiteContent`; backends called with `validate: false`).
- Integration tests guard validation deduplication (`validate:false`, native backend not double-counting).

### Added

- **npm `sorane-astro-backend` bin** — prefers Rust JSON CLI when built; `SORANE_ASTRO_BACKEND_NATIVE=0` falls back to TypeScript (`packages/astro/src/backend-bin.ts`).
- `buildSoraneAstroTsArtifacts` — TypeScript artifact build without validation (`backend-ts.ts` shrink).
- `@sorane/search` `IndexStore` reads Rust `chunk_vectors` blobs for hybrid export and KNN when `vec_chunks` is absent.

### Changed

- README / `website/content/configuration.md` — native CLI hybrid routing and env opt-outs.
- Documented f32 embedding parity between native ONNX and transformers.js; int8 web index SLA remains ≥ 0.95 cosine.
- Astro CI job runs `tests/cli-direct.test.ts` (native index/search) after `cargo build` and `fetch-model`.

### Changed

- Native `model_available` requires `onnx/model_quantized.onnx` and `tokenizer.json`, not only a model directory.
- Documented runtime split: native CLI uses Rust ONNX; TypeScript backend and `sorane index` still use `@sorane/search`.
- `resolveSoraneAstroBackend` respects `SORANE_ASTRO_BACKEND_NATIVE=0` (skips native CLI in `auto` / `cli`).
- Removed unused `packages/search/scripts/embed-batch.mjs`.
- Documented hybrid embedding SLA (cosine ≥ 0.95) in `design/astro-rust-backend.md`.

## [0.4.0] - 2026-06-21

### Added

- **`preset:` in `sorane.yaml`** — `blog` | `okf-site` | `gov` for site archetype defaults (blog/archives, diagrams, quality gates, machine-readable outputs)
- **`build.outputs`** — per-artifact toggles: `md_alternate`, `okf_bundle`, `catalog`, `llms_txt`, `feed`, `sitemap`, `robots`
- **Optional npm packages** — `@sorane/search`, `@sorane/font`, `mermaid` install on demand; CLI shows `npm install <pkg>` (or yarn/pnpm from lockfile) and prompts on TTY; `sorane index|search --yes` for non-interactive install
- Core helpers: `requireOptionalModule`, `resolveBuildOutputs`, `presetPartial` (exported from `@sorane/core`)

### Changed

- **Breaking — lighter defaults** (no `preset:`): `build.diagrams.enabled: false`, `build.blog.archives/tags: false`, lite `build.outputs` (feed/sitemap/robots on; catalog / llms.txt / okf bundle / sibling `.md` off)
- **Migration:** production OKF/agent sites should add `preset: okf-site` (or set `build.outputs` / `build.diagrams` explicitly). `website/`, `examples/open-data/`, and `template/site/` are updated
- `@sorane/cli` — `@sorane/search` is `optionalDependencies`; `index` / `search` commands load search lazily at runtime
- `@sorane/core` — font, search, mermaid are optional; conditional emit for catalog, llms.txt, okf bundle, md alternates, diagram assets, search assets
- `SlugLedger` / `slugifyHeading` live in `@sorane/core` (`heading-slug.ts`); `@sorane/search` re-exports for compatibility

### Removed

- `@sorane/cli-lite` workspace package (single `@sorane/cli` product; optional deps instead of a second CLI)

### Fixed

- Build continues when optional packages are missing, with install hints instead of opaque module errors

## [0.3.0] - 2026-06-21

### Added

- FAQ page template (`type: faq`): `##` Q/A sections, `.faq-*` CSS, `FAQPage` JSON-LD with `mainEntity`
- Glossary page template (`type: glossary`): `##` term sections or `terms:` frontmatter, `.glossary-*` CSS, `DefinedTermSet` JSON-LD with `hasDefinedTerm`
- **Glossary term page (`type: glossary-term`):** one term per file, `DefinedTerm` JSON-LD, auto `glossary/terms/index.html` when ≥1 term; search / validate integration
- Reference page template (`type: reference`): source metadata block, table-friendly `.reference-*` CSS, `TechArticle` JSON-LD with `isBasedOn`
- Search integration for OKF 0.3 types: `faq` / `glossary` / `glossary-term` section chunking, `reference` table text, `dataset` overview + `license:` / `format:` tags; UI and CLI `--type` facets for all types
- `validate --json` categories `faq`, `glossary`, `reference`, and `dataset` for structure / open-data warnings (`glossary-term` under `glossary`)
- `examples/open-data/` polish: README, AGENTS.md, landing index, `search.md`, `glossary/terms/*.md`, and agent doc updates (`template/site/AGENTS.md`, sorane-content skill)
- Opt-in `catalog-dcat.jsonld` DCAT-AP export (`site.open_data.dcat_catalog`) for `type: dataset` pages; `llms.txt` link when enabled
- **i18n Phase 2:** per-locale blog archives, tags, and pagination (`en/archive/`, `en/tag/`, etc.); `validate --json` category `i18n` for `translation_key` warnings
- **`okf` site config:** `okf.default_profile` and `okf.unknown_type` (`warn` | `error`) in `sorane.yaml` for site-wide OKF validation and build defaults

### Changed

- Workspace packages aligned to `0.3.0`

## [0.2.8] - 2026-06-21

### Added

- **Findability pack (public-sector sites):**
  - `site.organization`, `site.contact`, `site.findability` — `GovernmentOrganization` / `SearchAction` / `BreadcrumbList` JSON-LD; sitemap `lastmod` from `updated`; `robots.txt` `Disallow`; `llms.txt` publisher/contact; article fields `identifier` / `subject` / `audience` / `coverage`; search page `?q=` for SearchAction
  - **Quality gates:** `validate --json` categories `image`, `link`, `table`, `date`; `build.quality` toggles in `sorane.yaml`
  - **i18n:** `site.i18n.locales`, locale-prefixed `content/{prefix}/`, `translation_key`, `hreflang` / `og:locale:alternate`, per-page `lang`
  - **Emergency banner:** `site.emergency` on all pages (`role="alert"`), per-locale overrides
  - **Revision history:** `revisions` frontmatter → accessible table; `validate` category `revision`
  - **Cloudflare hosting hooks:** `site.hosting.provider: cloudflare` → `dist/ops/cloudflare.json`, `llms.txt` Access logs section; `templates/cloudflare/` for optional Logpush → R2
- `npm run stats` / `stats:json` — monorepo LOC, test ratio, workspace breakdown (`scripts/project-stats.ts`)
- CI `project-stats` job: append `stats/history.jsonl`, regenerate `stats/trend.md` on `main`
- sorane.dev **機能** page and refreshed docs navigation
- Broad unit/integration test suite; `npm run test:coverage` line gate **90%** (overall ~98% with `--test-isolation=none`)

### Changed

- Workspace packages aligned to `0.2.8`
- sorane.dev doc examples use `npx @sorane/cli` without version pin (CI pin remains optional)

### Fixed

- `validate` now parses frontmatter YAML via `parseYaml` (was treating YAML as object)
- Custom `404.md` with empty title uses `site.lang` for the fallback heading (was always Japanese)
- OKF bundle tar: reject paths longer than 100 bytes instead of silent truncation
- `sorane search --type article <query>` no longer treats the type value as the query
- CI: authenticate d2 install on Pages deploy; isolate `GITHUB_SHA` in stats-history tests; `npm ci --ignore-scripts` for image-metadata job

## [0.2.7] - 2026-06-21

### Added

- `sorane-okf/0.3` profile: `dataset`, `reference`, `glossary`, `faq` concept types
- Open-data frontmatter (`license`, `publisher`, `distributions`, …) and dataset landing page template
- Default theme CSS for `.dataset-*` landing layout
- `examples/open-data/` minimal dataset site
- Profile helpers in `@sorane/okf` (`resolveEffectiveType`, `isBuildableContentType`, …)
- `sorane migrate --bump-profile 0.3`

### Changed

- **`catalog.jsonld` breaking:** `type: dataset` pages go to `dataset[]`; other content pages go to `hasPart[]` as `BlogPosting` / `TechArticle` / `FAQPage` / `DefinedTermSet` (no legacy combined shape)
- Page JSON-LD: docs → `TechArticle`, blog → `BlogPosting`, `reference` → `TechArticle`, overridable via `creativeWorkType`
- `sorane-okf/0.3`: unknown `type` → warning + build treats as `article` (0.1/0.2 unchanged: error)
- Workspace packages aligned to `0.2.7`

### Fixed

- `@sorane/font` republished with npm provenance (Trusted Publisher + Node 24 publish job)

## [0.2.6] - 2026-06-21

### Added

- CI `npm publish --provenance` on tag release
- `website/content/supply-chain.md` and `/cbom.json` on sorane.dev
- `scripts/install-c2patool.sh` for CI (c2patool `.tar.gz` layout)

### Changed

- Workspace packages aligned to `0.2.6`
- Coverage gate: exclude `packages/search/**`, thresholds match current suite (50/65/60)

## [0.2.5] - 2026-06-21

### Added

- SLSA v1.0 Build-L3 tag release workflow (`.github/workflows/release.yml`)
- `cbom.json` + `npm run cbom-check` drift gate for in-process hash algorithms
- CI: `cbom-check`, `npm audit`, `release.yml` actionlint
- `docs/release-verification.md` for relying parties

### Fixed

- mmdc integration tests skip when Chromium unavailable in CI
- CBOM attestation via `actions/attest@v2` (crypto-only CycloneDX)

## [0.2.4] - 2026-06-21

### Added

- `sorane validate --json` — structured validation report (`schema_version: 1`) for AI agents
- `template/site/AGENTS.md` agent contract and `sorane-content` Grok skill
- `.grok/skills/sorane-agent` for monorepo development

### Fixed

- Bundle OKF profile schemas in `@sorane/okf` so `validate` works from npm installs

## [0.2.0] - 2026-06-21

### Added

- `sorane-okf/0.2` profile with IPTC / schema.org AI content disclosure (frontmatter, JSON-LD, catalog, search index, Atom)
- `content/asset-provenance.yaml` for static raster images; optional IPTC XMP (`build.image_metadata`) and C2PA signing (`build.c2pa`, `--skip-c2pa`)
- Markdown inline images (`![](path)`) resolved from `static/` and `content/`; provenance, XMP, and C2PA apply after copy to `dist/`
- `BlogPosting` JSON-LD `associatedMedia` (`ImageObject` + `digitalSourceType`) from inline images
- `sorane watch` / `sorane build --watch` for content hot-rebuild
- Static `404.html` (custom `content/404.md`, `static/404.html`, or default)
- OG / Twitter meta (`site.og_image`, per-page `og_image`)
- `sorane validate` warnings for diagram alt and heading hierarchy
- Search UI `aria-live` for screen readers
- Build duration summary (`built N page(s) in X.Xs`)
- `sorane migrate --bump-profile 0.2`
- Skip link on all pages; docs `<main>` landmark fix
- `website/content/ai-disclosure.md` user guide
- Playwright E2E: a11y smoke, 404 page, OG meta, search a11y
- Product site (`website/`) at sorane.dev (ssg.sorane.dev mirror; Cloudflare Pages)
- `excludeFromList` frontmatter to omit pages from blog index/archive lists
- Docs UX: `docs.nav` sidebar, page TOC, prev/next pager, heading anchors
- `sorane.yaml` `docs.nav` for documentation site navigation order
- npm workspace packages (`@sorane/cli`, `@sorane/core`, `@sorane/okf`, `@sorane/search`, `@sorane/font`) prepared for publish

## [0.1.0] - 2026-06-20

### Added

- OKF-native SSG (`sorane-okf/0.1` profile)
- CLI: `build`, `validate`, `migrate`, `index`, `search`
- Per-page font subsetting (bunsen WASM)
- Hybrid search (FTS5 + ruri-v3-30m embeddings)
- Blog layout: archives, tags, pagination
- Test infrastructure with coverage gate (~90% lines)

[Unreleased]: https://github.com/masanork/sorane/compare/v0.4.0...main
[0.4.0]: https://github.com/masanork/sorane/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/masanork/sorane/compare/v0.2.8...v0.3.0
[0.2.8]: https://github.com/masanork/sorane/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/masanork/sorane/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/masanork/sorane/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/masanork/sorane/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/masanork/sorane/compare/v0.2.0...v0.2.4
[0.2.0]: https://github.com/masanork/sorane/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/masanork/sorane/releases/tag/v0.1.0