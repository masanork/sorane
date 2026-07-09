---
type: article
title: リリースと配布
profile: sorane-okf/0.1
excludeFromList: true
---

## 現状（v0.5.0）

| 手段 | 状態 | 用途 |
|------|------|------|
| `npx @sorane/cli` | **利用可能** | サイトビルド・検証（検索は `@sorane/search` を追加） |
| git clone + `npm ci` | **利用可能** | 空音本体の開発 |
| GitHub Release タグ | **v0.5.x** | バージョン固定・SLSA 成果物 |
| Bunsen フォント資産 | **利用可能** | [bunsen-fonts-v1](https://github.com/masanork/sorane/releases/tag/bunsen-fonts-v1) |
| Docker イメージ | 未対応 | — |

npm パッケージ: `@sorane/cli`, `@sorane/core`, `@sorane/okf`, `@sorane/search`, `@sorane/font`, `@sorane/astro`, `@sorane/astro-backend-wasm`

### 使い方

```bash
npm install @sorane/cli
npx sorane validate --cwd ./my-site --json
npx sorane build --cwd ./my-site --clean
# 検索まで使う場合:
npm install @sorane/search
npx sorane index --cwd ./my-site --force
```

本番 CI でビルドの再現性が必要なときだけ `@sorane/cli@x.y.z` で pin します（任意）。

パッケージ一覧: https://www.npmjs.com/org/sorane

### v0.5.0 の主な変更

- **Native hybrid search** — Rust `sorane-astro-backend` が ruri-v3-30m を ONNX で実行（`ort` + `tokenizers`）。TS と per-chunk cosine ≥ 0.99 / 整合時は `vectors_b64` bit-identical
- **Native `sorane index` / `search`** — CLI がビルド済み native を優先（`SORANE_INDEX_NATIVE=0` / `SORANE_EMBED_NATIVE=0` でオプトアウト）
- **`@sorane/astro` / `@sorane/astro-backend-wasm`** — Astro 統合と WASM バックエンド（WASM は FTS-only）を npm 公開
- **`buildSoraneAstroArtifacts`** — TS 成果物ビルダを分離。integration 層が validation を所有
- npm bin `sorane-astro-backend` — native CLI 優先、未ビルド時は TypeScript fallback

### v0.4.0 の主な変更

- **`preset:`** — `blog` / `okf-site` / `gov` でサイト規模に応じた既定値
- **`build.outputs`** — 機械可読成果物の個別 on/off
- **軽量既定（breaking）** — 図表 off、アーカイブ/tag off、lite outputs。既存本番サイトは `preset: okf-site` を推奨
- **オプショナル npm** — `@sorane/search` / `@sorane/font` / `mermaid` を必要時インストール（CLI が案内・`--yes` 対応）
- `@sorane/cli-lite` 廃止（単一 CLI に統合）

### v0.3.0 の主な変更

- OKF 0.3 テンプレート一式（`dataset` / `reference` / `glossary` / `glossary-term` / `faq`）、DCAT カタログ、i18n Phase 2
- `okf.default_profile` / `okf.unknown_type` サイト設定
- `examples/open-data/` デモ拡充

### v0.2.8 の主な変更

- 公的サイト向け **Findability pack**（組織 JSON-LD、品質ゲート、i18n / hreflang、緊急バナー、改訂履歴、Cloudflare ホスティング hooks）
- `validate` category `revision`、frontmatter YAML パース修正
- ssg.sorane.dev [機能](features.html) ページ

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

**公式サイト** — 空音リポジトリ内の `website/` を dogfooding:

```
masanork/sorane
├── packages/*
└── website/
```

**コンテンツ分離** — サイト repo から npm で空音 CLI を呼び出す:

```yaml
- run: npx @sorane/cli@0.5.0 build --cwd . --clean
```

## サプライチェーン

詳細は [サプライチェーン](supply-chain.html) を参照してください。

`v*` タグで GitHub Release に次を添付します。

- npm pack tarball（`@sorane/*` ×7）
- source tarball、`sbom.json`、`cbom.json`
- SLSA Build-L3 provenance（`.intoto.jsonl`）

検証手順はリポジトリの [`docs/release-verification.md`](https://github.com/masanork/sorane/blob/main/docs/release-verification.md) を参照してください。

## ロードマップ

- [x] プロダクトサイト `ssg.sorane.dev`
- [x] `CHANGELOG.md` と SemVer タグ
- [x] npm 配布（`@sorane/cli` ほか）
- [x] SLSA L3 + SBOM/CBOM（タグリリース workflow）
- [x] CI から `npm publish --provenance`
- [x] optional dependencies の整理（v0.4.0）
- [x] Native hybrid / Astro backend 収束（v0.5.0）
- [x] GitHub Releases に Bunsen フォント資産（[bunsen-fonts-v1](https://github.com/masanork/sorane/releases/tag/bunsen-fonts-v1)）
- [ ] Homebrew formula / Docker image
