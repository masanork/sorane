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

| 変数 | 効果 |
|------|------|
| `SORANE_ASTRO_BACKEND_NATIVE=0` | ネイティブ artifact backend を無効化（`backend: "ts"` 相当） |
| `SORANE_ASTRO_BACKEND_CLI` | ネイティブバイナリのパスを上書き |
| `SORANE_INDEX_NATIVE=0` | TS `search-backend` / `sorane index` の索引を `@sorane/search` のみに固定 |
| `SORANE_EMBED_NATIVE=0` | ブラウザ外のクエリ埋め込みを transformers.js のみに固定（CLI） |

リポジトリ開発時は `cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml` でネイティブ CLI を生成します。npm の `sorane-astro-backend` コマンド（`@sorane/astro` パッケージ）も、バイナリがあれば Rust を優先し、無ければインライン TypeScript にフォールバックします。WASM は `npm run build:astro-backend-wasm`（`@sorane/astro-backend-wasm`）で再ビルドできます。

### 検索（`outputs.search`）

| backend | hybrid 索引 | クエリ埋め込み（CLI） |
|---------|-------------|------------------------|
| ネイティブ CLI（`auto` / `cli`） | Rust ONNX（`search_ruri.rs`） | —（artifact のみ） |
| TS `search-backend`（フォールバック） | ネイティブ `index` 優先 → 無ければ `@sorane/search` | — |
| WASM | **FTS のみ**（wasm32 に ort なし） | — |
| `sorane search`（ローカル試行） | 索引に依存 | ネイティブ `embed` 優先 → 無ければ transformers.js |

ハイブリッドには `onnx/model_quantized.onnx` と `tokenizer.json` が必要です。モデルが無い場合は FTS-only にフォールバックします。

## コンテンツ検証

Astro 統合（`emitSoraneAstroArtifacts`）では **TypeScript の `validateSiteContent` が唯一のゲート** です。`validate: "warn"` / `"error"` はこの層だけが解釈し、artifact backend（ネイティブ / WASM / TS）は常に `validate: false` で呼ばれます（重複検証なし）。

ネイティブ Rust backend 単体（`sorane-astro-backend` を JSON で直接実行）では Rust 側 validation も利用できます。CI の parity テスト（`tests/astro-backend-validation-parity.test.ts`）で TS と件数一致を監視しています。

## 制限（現時点）

- ルート検出は `getCollection()` の静的解析ベースで、動的ルートすべてをカバーしません。
- **WASM hybrid 非対応**: `@sorane/astro-backend-wasm` は FTS 検索 JSON のみ。ブラウザ hybrid（`search.mjs`）は別途 `@sorane/search` + モデル vendoring が必要です。
- `outputs.search` の companion（`search.mjs`、hybrid 時の `models/`）は dist 書き出し後にコピーされます。

設計の詳細はリポジトリ内 `design/astro-rust-backend.md` を参照してください。