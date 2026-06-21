---
type: article
title: 設定（YAML）
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
  og_image: /assets/og-default.png   # 任意。要 base_url

build:
  content_dir: content
  out_dir: dist
  permalink: "{{slug}}.html"
```

記事ごとに `og_image` frontmatter で上書きできます（絶対 URL またはサイトルート相対パス）。

## 404 ページ

ビルドは常に `404.html` を `out_dir` 直下に出力します。`content/404.md` で本文をカスタムできます（詳細は [デプロイ](deployment.html)）。

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

## 図表

Markdown のコードフェンスで図を書けます。ソースは `.md` 代替ファイルと OKF バンドルにそのまま残ります。

```yaml
build:
  diagrams:
    enabled: true
    mermaid:
      mode: client    # client | build | off
      mmdc: mmdc      # mermaid.mode: build 時の CLI（既定は @mermaid-js/mermaid-cli）
    d2:
      enabled: false
      binary: d2
    graphviz:
      enabled: false
      binary: dot
```

- ` ```mermaid ` … `mode: client`（既定）ではクライアント描画（`sorane-mermaid-loader.mjs` を条件付き読み込み）
- `mermaid.mode: build` … `@mermaid-js/mermaid-cli`（mmdc + Chromium）でビルド時 SVG（`assets/diagrams/mermaid/{hash}.svg`）。クライアント loader は不要
- `alt="..."` を info string に付けるか、`%% alt: 説明` コメントで代替テキストを指定
- `d2.enabled: true` … `d2` CLI でビルド時 SVG（`assets/diagrams/d2/{hash}.svg`）
- ` ```graphviz ` / ` ```dot ` … `graphviz.enabled: true` かつ `dot` が PATH にあるときビルド時 SVG
- いずれのバックエンドも CLI 欠落時は警告のうえ `<pre><code>` フォールバック（ビルドは継続）

詳細と例は [図表](diagrams.html) を参照してください。`sorane validate` は alt 欠落の図表フェンスを warning で報告します。

## AI 開示

`profile: sorane-okf/0.2` と frontmatter で IPTC / schema.org 準拠の開示ができます。詳細は [AI 開示](ai-disclosure.html) を参照してください。

## 静的画像 IPTC XMP

```yaml
build:
  image_metadata:
    enabled: false
    exiftool: exiftool
    manifest: asset-provenance.yaml   # content/ からの相対（既定）
```

`content/asset-provenance.yaml` と組み合わせて `static/` 内の JPEG/PNG/WebP に IPTC Extension XMP を埋め込みます。詳細は [AI 開示](ai-disclosure.html) を参照してください。

## 静的画像 C2PA

```yaml
build:
  c2pa:
    enabled: false
    embed: true
    binary: c2patool
```

`content/asset-provenance.yaml` と組み合わせて `static/` 内の JPEG/PNG に署名します。`sorane build --skip-c2pa` で CI スナップショット向けに署名を省略できます。