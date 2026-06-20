---
type: article
title: OKF プロファイル
profile: sorane-okf/0.1
excludeFromList: true
---

sorane は [Open Knowledge Format (OKF) v0.1](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) を実装し、プロファイル `sorane-okf/0.1` で検証します。

## サポートする concept 型

| type | 用途 |
|------|------|
| `article` | ブログ記事・ドキュメントページ |
| `index` | サイトトップ |

必須フィールドは `type` と `title` です。

## 記事の例

```yaml
---
type: article
title: Hello OKF
timestamp: 2025-01-01T00:00:00Z
tags: [sorane]
profile: sorane-okf/0.1
---

本文（Markdown）
```

## ビルド出力

| パス | 内容 |
|------|------|
| `*.html` | 人間向けページ |
| `*.md` | OKF ネイティブ代替ソース |
| `catalog.jsonld` | DCAT 形式カタログ |
| `llms.txt` | LLM 向けサイトガイド |
| `okf/bundle.tar.gz` | `{type}/{slug}.md` のバンドル |

## JSON Schema

プロファイル定義はリポジトリの `profile/sorane-okf-0.1.schema.json` にあり、公式サイトでは [こちら](profile/sorane-okf-0.1.schema.json) から取得できます。

`$id` は公式サイトの本番 URL `sorane.dev` を指します。