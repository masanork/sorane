---
type: article
title: Astro 連携
profile: sorane-okf/0.1
excludeFromList: true
---

Astro でページを描画しつつ、sorane が OKF とエージェント向けの機械可読出力を担う統合です。

## 役割分担

| レイヤ | 担当 |
|--------|------|
| Astro | HTML レンダリング、ルーティング、コンポーネント |
| `@sorane/astro` | OKF 検証、`catalog.jsonld`、`llms.txt`、`okf/bundle.tar.gz` など |

`astro build` 完了後の `astro:build:done` フックで、`src/content/**/*.md(x)` を走査してアーティファクトを `dist/` に書き出します。

## インストール

```bash
npm install astro @sorane/astro
```

検索アセット（`assets/search-index.json`）を出す場合は `@sorane/search` も追加します。

```bash
npm install @sorane/search
```

## 最小設定

```js
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
      validate: "error",
    }),
  ],
});
```

- `collections`: `src/content/posts/hello.md` → `blog/hello.html` のように URL を推論
- `permalink: "directory"`: `blog/hello/index.html` 形式
- `validate`: `false` / `"warn"` / `"error"`（既定 `"warn"`）。`sorane validate` と同系統の品質ゲートを `.md` に適用

## 出力の切り替え

```js
soraneAstro({
  site: { title: "S", description: "D", baseUrl: "https://example.dev" },
  outputs: {
    catalog: true,
    llmsTxt: true,
    okfBundle: true,
    sitemap: false,
    search: true,
  },
  search: {
    indexPath: ".sorane/index.db",
    force: false,
    mode: "fts",
  },
});
```

| 出力 | 既定 | 説明 |
|------|------|------|
| `catalog` | on | JSON-LD カタログ |
| `llmsTxt` | on | `llms.txt` |
| `okfBundle` | on | `okf/bundle.tar.gz` |
| `sitemap` | off | `sitemap.xml` |
| `search` | off | FTS 検索用 `assets/search-index.json` + `assets/search.mjs` |
| `dcatCatalog` | off | `catalog-dcat.jsonld`（`type: dataset` のみ） |

## サンプル

リポジトリ内の [`examples/astro-minimal/`](https://github.com/masanork/sorane/tree/main/examples/astro-minimal) を参照してください。

```bash
cd examples/astro-minimal
npm install
npm run build
```

## ルート自動検出

`src/pages` 内の `getCollection('posts')` などを静的解析し、`collections` の手動指定が無い場合は URL ベースを推論します。手動 `collections` は検出結果より優先されます。

## バックエンド

```js
soraneAstro({
  backend: "auto", // auto | ts | cli | wasm
});
```

| 値 | 動作 |
|----|------|
| `auto`（既定） | ネイティブ Rust CLI（`cargo build` 済み）→ WASM → インライン TS |
| `cli` | ネイティブ Rust CLI（未ビルド時は TS にフォールバック） |
| `ts` | インライン TypeScript backend |
| `wasm` | `@sorane/astro-backend-wasm`（ネイティブ CLI 不要） |

環境変数:

- `SORANE_ASTRO_BACKEND_NATIVE=0` — ネイティブ CLI を無効化（`backend: "ts"` を使う）
- `SORANE_ASTRO_BACKEND_CLI` — ネイティブバイナリのパスを上書き

リポジトリ開発時は `cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml` でネイティブ CLI を生成します。WASM は `npm run build:astro-backend-wasm`（`@sorane/astro-backend-wasm`）で再ビルドできます。

## 制限（現時点）

- ルート検出は `getCollection()` の静的解析ベースで、動的ルートすべてをカバーしません。
- コンテンツ検証は統合層が常に TypeScript の `validateSiteContent` を実行します（`backend: "auto"` でもネイティブと同じゲート）。artifact backend は `validate: false` で呼ばれ、重複検証しません。
- ネイティブ Rust backend の validation: Phase A–D + `validateConfigSecurity`（緊急バナー URL、カスタムバイナリ拒否）。統合層は引き続き常に TypeScript の `validateSiteContent` を実行します。
- `outputs.search` は backend contract 経由（`assets/search-index.json` を artifact として返す）。`search.mjs` 等の companion は書き出し後にコピーされます。ネイティブ CLI は FTS + hybrid（SQLite 増分索引、埋め込みは `@sorane/search` Node bridge）を実装済み。WASM は FTS のみ。
設計の詳細はリポジトリ内 `design/astro-rust-backend.md` を参照してください。