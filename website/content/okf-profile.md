---
type: article
title: OKF プロファイル
profile: sorane-okf/0.1
excludeFromList: true
---

空音は [Open Knowledge Format (OKF) v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)（[発表](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals)）をベースに実装します。各ページの frontmatter に `profile: sorane-okf/<version>` を書き、JSON Schema で検証します。

### 名前の注意: `sorane-okf/0.2` ≠ OKF v0.2

| 名前 | 意味 |
|------|------|
| **OKF v0.2** | 上流仕様（trust / provenance / lifecycle / attestation） |
| **`sorane-okf/0.2`** | 空音のプロファイル版（記事型 + [AI 開示](ai-disclosure.html) の厳密検証） |

OKF v0.2 の trust 系フィールド（`generated`, `verified`, `sources`, `status`, `stale_after`）は **すべての** `sorane-okf/0.x` で任意に使えます。`timestamp` が無い場合は `generated.at` を内容日時として使います（OKF §13.1）。

## サポートする concept 型

| type | 用途 | `catalog.jsonld` |
|------|------|------------------|
| `article` | ブログ記事・ドキュメント | `hasPart`（`BlogPosting` / `TechArticle`） |
| `index` | サイトトップ | （カタログに含めない） |
| `dataset` | オープンデータのランディング | `dataset`（`Dataset` + `distribution`） |
| `reference` | コード一覧・仕様参照 | `hasPart`（`TechArticle`） |
| `glossary` | 分野別用語集（1 ファイル複数語） | `hasPart`（`DefinedTermSet`） |
| `faq` | Q&A ページ | `hasPart`（`FAQPage`） |

すべての型で `type` と `title` が必須です。

`dataset` では次も必須です: `description`, `resource`, `license`, `publisher`, `distributions`（各要素に `title`, `format`, `accessURL`）。

任意の `theme` は DCAT-AP の EU コード（`GOVE`, `ECON`, `HEAL` など）を推奨します。コード形式で未知の値は `sorane validate` が warning を出します。自由なタグ文字列も許容されます。

`content/datasets/` のようにサブディレクトリにページが 2 件以上あり、作者の `index.md` が無い場合、ビルドは OKF 形式のディレクトリ一覧（`{dir}/index.html` と `okf/bundle.tar.gz` 内の `{dir}/index.md`）を自動生成します。サイトトップの `content/index.md`（`type: index`）とは別物です。

## プロファイル文字列

frontmatter の `profile` で、検証の厳しさと使える `type` を選びます。

| `profile` | 使える `type` | 未知の `type` | AI 開示フィールド |
|-----------|---------------|---------------|-------------------|
| `sorane-okf/0.1` | `article`, `index` | **error** | 任意（形状は緩い） |
| `sorane-okf/0.2` | `article`, `index` | **error** | 厳密検証（[AI 開示](ai-disclosure.html)） |
| `sorane-okf/0.3` | 上表の 7 型 | **warning**（ビルドは `article` 扱い） | 厳密検証 |

新規サイトは用途に応じて `sorane-okf/0.3`（拡張型・オープンデータ）または `sorane-okf/0.2`（記事のみ + AI 開示）を選ぶのが一般的です。既存サイトは `migrate --bump-profile` で上げられます。

`sorane.yaml` の `okf.default_profile` でサイト全体の既定プロファイルを指定できます（各ページの `profile:` は省略可能）。`okf.unknown_type` で 0.3 の未知 `type` を `warn`（既定）か `error` に切り替えられます。詳細は [設定](configuration.html#okf-サイト既定okf) を参照してください。

```bash
npx @sorane/cli migrate --cwd . --bump-profile 0.3
```

## OKF v0.2 trust フィールド（任意）

| フィールド | 用途 |
|------------|------|
| `generated: { by, at }` | 誰が・いつ書いたか（`at` はタイムゾーン付き ISO 8601 日時。`timestamp` の代替可） |
| `verified: { by, at }` またはリスト | 確認イベント（各イベントに `at` 必須）。`human:` 接頭辞 → trust tier **human-reviewed** |
| `sources[]` | 由来（各要素に `resource` 必須。任意で `id`, `title`, `author`, `usage_count`, `last_modified`。日時値はタイムゾーン付き ISO 8601） |
| `usage_window: { from, to }` | `usage_count` の集計期間（日時はタイムゾーン付き ISO 8601） |
| `status` | `draft` \| `stable` \| `deprecated`（省略 = stable） |
| `stale_after` | 鮮度期限（タイムゾーン付き ISO 8601 日時。経過後は `validate` が warning） |

Actor 表記: `producer/version`（エージェント）、`human:<id>`、`process:<id>`。

HTML の記事メタ・`catalog.jsonld` の keywords（`trust:`, `status:`, …）・OKF bundle に伝播します。`type: Attested Computation` と runtime 実行は未実装です（0.3 では未知 type として warning + article 扱い）。

## 記事の例

```yaml
---
type: article
title: Hello OKF
timestamp: 2025-01-01T00:00:00Z
tags: [sorane]
profile: sorane-okf/0.3
---

本文（Markdown）
```

### trust 付きの例

```yaml
---
type: article
title: Customer Orders
profile: sorane-okf/0.3
status: stable
stale_after: 2026-12-31T00:00:00Z
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
verified: { by: human:alice, at: 2026-06-25T09:00:00Z }
sources:
  - id: warehouse-schema
    resource: https://wiki.example/schemas/sales
    title: Sales warehouse schema
---

本文（Markdown）
```

## データセットの例

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

実例: [examples/open-data/](https://github.com/masanork/sorane/tree/main/examples/open-data)（[README](https://github.com/masanork/sorane/blob/main/examples/open-data/README.md) に全ページ一覧と `index` / `search` の手順）

## 用語集・FAQ の例

`glossary` と `faq` は本文で `##` 見出しごとに用語・質問を書きます。アンカー `{#id}` を付けるとページ内リンクと JSON-LD の term id に使えます。

```markdown
## 分散 {#variance}

標本の二乗偏差の平均。
```

`glossary` は frontmatter の `terms:` リストでも定義できます（本文の `##` がある場合は本文を優先）。

### 単一用語ページ（`glossary-term`）

1 語 1 ファイルで transclusion や深いリンク向けです。`term_id` と親用語集 `inDefinedTermSet`（または `glossary`）を推奨します。2 件以上あると `glossary/terms/index.html` にタグ一覧風の索引が自動生成されます。

```yaml
---
type: glossary-term
title: Distribution
term_id: distribution
inDefinedTermSet: glossary.html
profile: sorane-okf/0.3
---

A downloadable representation of a dataset.
```

出力 HTML のパスは `permalink` の `{{slug}}` 規則に従います（`content/glossary/terms/distribution.md` → `distribution.html`）。

## 参照（reference）の例

コード一覧や CSV 列定義向けです。`resource` に元データや仕様書の URI を書き、本文は GFM 表が一般的です。

```yaml
---
type: reference
title: Stops CSV Fields
description: Column definitions for stops.csv
resource: https://example.dev/static/stops.csv
profile: sorane-okf/0.3
---

| Column | Type | Description |
|--------|------|-------------|
| stop_id | string | Unique stop id |
```

検索インデックスは `doc_type`（frontmatter の `type`）で絞り込めます。`dataset` には `license:` / `theme:` / `format:` タグが付与され、`sorane search --tag format:csv` のように検索できます。

## ビルド出力

| パス | 内容 |
|------|------|
| `*.html` | 人間向けページ |
| `*.md` | OKF ネイティブ代替ソース |
| `catalog.jsonld` | schema.org カタログ（`dataset[]` と `hasPart[]` を分離） |
| `catalog-dcat.jsonld` | DCAT-AP JSON-LD（`type: dataset` のみ、opt-in） |
| （運用） | [Open Data Portal 連携](open-data-harvesting.html) — CKAN / data.europa.eu |
| `llms.txt` | LLM 向けサイトガイド |
| `okf/bundle.tar.gz` | `{type}/{slug}.md` のバンドル |
| `okf/site.okfc` | OKFC サイト全体（SQLite + FTS5）。ベクトルは任意・未実装 |
| `okf/units/*.okfc` | コンテンツまとまり単位の OKFC（`build.okfc.auto_directories` / `units`） |
| `okf/registry.json` | 複数 OKFC の索引（OKFC §7 風）。`search: "fts"` |

## JSON Schema

| プロファイル | スキーマ |
|-------------|----------|
| `sorane-okf/0.1` | [sorane-okf-0.1.schema.json](profile/sorane-okf-0.1.schema.json) |
| `sorane-okf/0.2` | [sorane-okf-0.2.schema.json](profile/sorane-okf-0.2.schema.json) |
| `sorane-okf/0.3` | [sorane-okf-0.3.schema.json](profile/sorane-okf-0.3.schema.json) |

`$id` は本番 URL `ssg.sorane.dev` を指します。
