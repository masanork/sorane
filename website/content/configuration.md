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

```yaml
search:
  index: .sorane/index.db
  model: vendor/models
  model_id: ruri-v3-30m
  bundle_model: false          # Cloudflare Pages 25MiB 制限対策
  asset_base_url: ""           # R2 等にモデルを置く場合
```

検索 UI は `view: search` を持つ記事ページで有効になります。