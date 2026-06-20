# Changelog

All notable changes to sorane are documented here. Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Official docs site (`website/`) deployed to sorane.pages.dev
- `excludeFromList` frontmatter to omit pages from blog index/archive lists

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