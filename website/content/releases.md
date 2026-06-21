---
type: article
title: リリースと配布
profile: sorane-okf/0.1
excludeFromList: true
---

## 現状（v0.2.7）

| 手段 | 状態 | 用途 |
|------|------|------|
| `npx @sorane/cli` | **利用可能** | サイトビルド・検索・検証 |
| git clone + `npm ci` | **利用可能** | sorane 本体の開発 |
| GitHub Release タグ | **v0.2.x** | バージョン固定 |
| Docker イメージ | 未対応 | — |

npm パッケージ: `@sorane/cli`, `@sorane/core`, `@sorane/okf`, `@sorane/search`, `@sorane/font`

### 使い方

```bash
npx @sorane/cli@0.2.7 validate --cwd ./my-site --json
npx @sorane/cli@0.2.7 build --cwd ./my-site --clean
```

パッケージ一覧: https://www.npmjs.com/org/sorane

### v0.2.7 の主な変更

- `sorane-okf/0.3` プロファイル（`dataset`, `reference`, `glossary`, `faq`）
- `catalog.jsonld` の `dataset[]` / `hasPart[]` 分離（breaking）
- `examples/open-data/`、dataset ランディング CSS、`migrate --bump-profile 0.3`

### v0.2 の主な変更

- `sorane-okf/0.2` プロファイルと AI コンテンツ開示
- 静的画像の IPTC XMP / C2PA
- `BlogPosting` JSON-LD `associatedMedia`
- `sorane watch`、静的 `404.html`、OG メタ、a11y 改善
- `validate --json` によるエージェント向け検証レポート

詳細はリポジトリの `CHANGELOG.md` を参照してください。

## 配布の形

**公式サイト** — sorane リポジトリ内の `website/` を dogfooding:

```
masanork/sorane
├── packages/*
└── website/
```

**コンテンツ分離** — サイト repo から npm で sorane を pin:

```yaml
- run: npx @sorane/cli@0.2.7 build --cwd . --clean
```

## サプライチェーン

詳細は [サプライチェーン](supply-chain.html) を参照してください。

`v*` タグで GitHub Release に次を添付します。

- npm pack  tarball（`@sorane/*` ×5）
- source tarball、`sbom.json`、`cbom.json`
- SLSA Build-L3 provenance（`.intoto.jsonl`）

検証手順はリポジトリの [`docs/release-verification.md`](https://github.com/masanork/sorane/blob/main/docs/release-verification.md) を参照してください。

## ロードマップ

- [x] プロダクトサイト `sorane.dev`
- [x] `CHANGELOG.md` と SemVer タグ
- [x] npm 配布（`@sorane/cli` ほか）
- [x] SLSA L3 + SBOM/CBOM（タグリリース workflow）
- [x] CI から `npm publish --provenance`
- [ ] GitHub Releases に Bunsen フォント資産
- [ ] optional dependencies の整理
- [ ] Homebrew formula / Docker image