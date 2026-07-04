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
  backend: "ts", // auto | ts | cli | wasm
});
```

- `ts`: 組み込み TypeScript backend（既定）
- `cli`: `rust/sorane-astro-backend` の JSON 契約 CLI（ビルド済みまたは `SORANE_ASTRO_BACKEND_CLI`）
- `auto`: 現状は `ts`。`SORANE_ASTRO_BACKEND_PREFER_CLI=1` で CLI 優先を試せます

## 制限（現時点）

- ルート検出は `getCollection()` の静的解析ベースで、動的ルートすべてをカバーしません。
- Rust CLI は OKF コア出力の初期実装です（品質ゲートは TS backend が担当）。

設計の詳細はリポジトリ内 `design/astro-rust-backend.md` を参照してください。