# Changelog

All notable changes to sorane are documented here. Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- SLSA v1.0 Build-L3 tag release workflow (`.github/workflows/release.yml`)
- `cbom.json` + `npm run cbom-check` drift gate for in-process hash algorithms
- CI: `cbom-check`, `npm audit`, `release.yml` actionlint
- `docs/release-verification.md` for relying parties

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

[Unreleased]: https://github.com/masanork/sorane/compare/v0.2.4...main
[0.2.4]: https://github.com/masanork/sorane/compare/v0.2.0...v0.2.4
[0.2.0]: https://github.com/masanork/sorane/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/masanork/sorane/releases/tag/v0.1.0