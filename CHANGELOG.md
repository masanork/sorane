# Changelog

All notable changes to sorane are documented here. Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- `sorane watch` / `sorane build --watch` for content hot-rebuild
- Static `404.html` (custom `content/404.md`, `static/404.html`, or default)
- OG / Twitter meta (`site.og_image`, per-page `og_image`)
- `sorane validate` warnings for diagram alt and heading hierarchy
- Search UI `aria-live` for screen readers
- Build duration summary (`built N page(s) in X.Xs`)
- `sorane migrate --bump-profile 0.2`
- Skip link on all pages; docs `<main>` landmark fix
- `website/content/ai-disclosure.md` user guide
- C2PA signing MVP for `static/` JPEG/PNG (`build.c2pa`, `asset-provenance.yaml`, `--skip-c2pa`)
- Playwright E2E: a11y smoke, 404 page, expanded fixture site
- Product site (`website/`) at sorane.dev (ssg.sorane.dev mirror; Cloudflare Pages)
- `excludeFromList` frontmatter to omit pages from blog index/archive lists
- Docs UX: `docs.nav` sidebar, page TOC, prev/next pager, heading anchors
- `sorane.yaml` `docs.nav` for documentation site navigation order

## [0.1.0] - 2026-06-20

### Added

- OKF-native SSG (`sorane-okf/0.1` profile)
- CLI: `build`, `validate`, `migrate`, `index`, `search`
- Per-page font subsetting (bunsen WASM)
- Hybrid search (FTS5 + ruri-v3-30m embeddings)
- Blog layout: archives, tags, pagination
- Test infrastructure with coverage gate (~90% lines)

[Unreleased]: https://github.com/masanork/sorane/compare/v0.1.0...main
[0.1.0]: https://github.com/masanork/sorane/releases/tag/v0.1.0