---
type: article
title: 設定（sorane.yaml）
profile: sorane-okf/0.1
excludeFromList: true
---

## 最小構成

```yaml
site:
  title: My Site
  description: Site description
  base_url: https://example.pages.dev
  lang: ja

build:
  content_dir: content
  out_dir: dist
  permalink: "{{slug}}.html"
```

## ブログ機能

```yaml
build:
  blog:
    page_size: 50
    index_archive_limit: 15
    featured_mode: excerpt   # excerpt | full | off
    excerpt_length: 400
    archives: true
    tags: true
```

## フォントサブセット

ページごとに WOFF2 サブセットを埋め込みます（bunsen WASM）。

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

frontmatter で `noFontEmbedding: true` を指定したページはシステムフォントを使います。

## 検索

標準は FTS（キーワード検索）です。モデル不要で軽量です。

```yaml
search:
  index: .sorane/index.db
```

ハイブリッド（自然文 RAG）は experimental です。埋め込みモデルとランタイム（約 24MB）が必要です。

```yaml
search:
  mode: hybrid                 # experimental
  index: .sorane/index.db
  model: vendor/models
  model_id: ruri-v3-30m
  bundle_model: false          # Cloudflare Pages 25MiB 制限対策
  asset_base_url: ""           # R2 等に ONNX を置く場合
```

- `sorane index` … FTS（既定）
- `sorane index --hybrid` … ベクトル付きインデックス（要 `npm run fetch-model`）

検索 UI は `view: search` を持つ記事ページで有効になります。

## 図表（Mermaid / D2）

Markdown のコードフェンスで図を書けます。ソースは `.md` 代替ファイルと OKF バンドルにそのまま残ります。

```yaml
build:
  diagrams:
    enabled: true
    mermaid:
      mode: client    # client | off（build は未実装）
    d2:
      enabled: false  # Phase 2: ビルド時 SVG
      binary: d2
```

- ` ```mermaid ` … クライアント側で SVG 描画（`assets/diagrams/sorane-mermaid-loader.mjs` を条件付きで読み込み）
- `alt="..."` を info string に付けるか、`%% alt: 説明` コメントで代替テキストを指定
- `mermaid.mode: build`（Chromium + mmdc によるビルド時 SVG）は**未実装**です。指定しても `client` と同様に動作し、警告が出ます
- `d2.enabled: true` … ビルド時に `d2` CLI で SVG を生成（`assets/diagrams/d2/{hash}.svg`）。CI に `d2` が無い場合は警告のうえ `<pre><code>` フォールバック

詳細と例は [図表](diagrams.html) を参照してください。