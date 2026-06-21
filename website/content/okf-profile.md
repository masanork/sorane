---
type: article
title: OKF プロファイル
profile: sorane-okf/0.1
excludeFromList: true
---

sorane は [Open Knowledge Format (OKF) v0.1](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) を実装し、プロファイル `sorane-okf/0.1`〜`0.3` で検証します。

## サポートする concept 型

### sorane-okf/0.1・0.2

| type | 用途 |
|------|------|
| `article` | ブログ記事・ドキュメントページ |
| `index` | サイトトップ |

必須フィールドは `type` と `title` です。`0.2` では AI 開示フィールド（`digitalSourceType` など）が追加されます。

### sorane-okf/0.3（拡張型）

| type | 用途 | catalog.jsonld |
|------|------|----------------|
| `article` | ブログ・ドキュメント | `hasPart`（`BlogPosting` / `TechArticle`） |
| `index` | サイトトップ | （カタログに含めない） |
| `dataset` | オープンデータのランディング | `dataset`（`Dataset` + `distribution`） |
| `reference` | コード一覧・仕様参照 | `hasPart`（`TechArticle`） |
| `glossary` | 分野別用語集（1 ファイル複数語） | `hasPart`（`DefinedTermSet`） |
| `faq` | Q&A ページ | `hasPart`（`FAQPage`） |

未知の `type` は **warning** のみ（ビルドは `article` として扱う）。`0.1` / `0.2` では従来どおり未知 type は **error** です。

`dataset` の必須フィールド: `title`, `description`, `resource`, `license`, `publisher`, `distributions`（各要素に `title`, `format`, `accessURL`）。

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

## データセットの例（0.3）

```yaml
---
type: dataset
title: Transit Stops
description: Bus stop coordinates.
resource: https://example.dev/datasets/transit-stops
license: CC-BY-4.0
profile: sorane-okf/0.3
publisher:
  name: Example Org
  url: https://example.dev
distributions:
  - title: Stops CSV
    format: csv
    accessURL: static/stops.csv
---

本文（データの説明・更新履歴など）
```

## ビルド出力

| パス | 内容 |
|------|------|
| `*.html` | 人間向けページ |
| `*.md` | OKF ネイティブ代替ソース |
| `catalog.jsonld` | DCAT 形式カタログ（0.3: `dataset[]` と `hasPart[]` を分離） |
| `llms.txt` | LLM 向けサイトガイド |
| `okf/bundle.tar.gz` | `{type}/{slug}.md` のバンドル |

## JSON Schema

| プロファイル | スキーマ |
|-------------|----------|
| `sorane-okf/0.1` | [sorane-okf-0.1.schema.json](profile/sorane-okf-0.1.schema.json) |
| `sorane-okf/0.2` | [sorane-okf-0.2.schema.json](profile/sorane-okf-0.2.schema.json) |
| `sorane-okf/0.3` | [sorane-okf-0.3.schema.json](profile/sorane-okf-0.3.schema.json) |

`$id` は公式サイトの本番 URL `sorane.dev` を指します。