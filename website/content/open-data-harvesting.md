---
type: article
title: Open Data Portal 連携
profile: sorane-okf/0.1
excludeFromList: true
---

空音の静的サイトは **単一オリジンのデータカタログ** として機能します。全国ポータル（[data.europa.eu](https://data.europa.eu)）や CKAN インスタンスへ載せるには、ビルド成果物を **外部ハーベスターが取り込める形** にしておきます。

## 空音が出すファイル

| ファイル | 用途 |
|----------|------|
| `catalog.jsonld` | schema.org カタログ（全ページ） |
| `catalog-dcat.jsonld` | DCAT-AP 形状の JSON-LD（`type: dataset` のみ、opt-in） |
| `*.html` / `*.md` | 人間・エージェント向けランディング |
| `llms.txt` | サイト全体の機械可読ガイド |

DCAT カタログを有効にする:

```yaml
site:
  open_data:
    dcat_catalog: true
```

例: [examples/open-data](https://github.com/masanork/sorane/tree/main/examples/open-data)

## CKAN への手動取り込み

空音は CKAN API や Solr を実装しません。運用者が **CKAN のデータセット UI** でメタデータを登録し、`distributions[].accessURL` を空音の静的ファイル URL に合わせます。

| CKAN フィールド | 空音 OKF / ビルド |
|-----------------|---------------------|
| Title | frontmatter `title` |
| Description | `description` |
| License | `license`（SPDX 推奨） |
| Tags | `tags` + `theme:`（dataset 検索タグ） |
| Organization | `publisher.name`（サイト単位; CKAN Organization は手動で対応付け） |
| Resource name | `distributions[].title` |
| Resource format | `distributions[].format`（`text/csv` 等） |
| Resource URL | `distributions[].accessURL`（`static/` 配下の絶対 URL） |

**手順（概要）**

1. `sorane build` で `dist/` を公開（HTTPS 必須）。
2. `catalog-dcat.jsonld` を開き、対象 dataset の `dct:title` / `dct:description` / `dcat:distribution` を確認。
3. CKAN で新規 Dataset を作成し、上表どおりフィールドを転記。
4. 各 Resource の URL を `accessURL` と一致させる（CSV は `static/data/…` など）。
5. 更新時は `updated` frontmatter と `catalog-dcat.jsonld` の `dct:modified` を揃え、CKAN 側も再公開。

## data.europa.eu 品質チェックリスト（対応表）

[data.europa.eu](https://data.europa.eu) のハーベストは **DCAT-AP カタログフィード** を前提とします。空音単体はポータル準拠の RDF ストアではありませんが、`catalog-dcat.jsonld` とランディングページで次の項目を満たしやすくします。

| 品質観点 | 空音での対応 |
|----------|-----------------|
| データセットの発見可能性 | `catalog-dcat.jsonld` + `llms.txt` + サイト内検索 |
| タイトル・説明 | OKF `title` / `description` → DCAT `dct:title` / `dct:description` |
| ライセンス | `license` → `dct:license`（URI 推奨） |
| 配布形式の明示 | `distributions[].format` → `dcat:mediaType` |
| ダウンロード URL | `distributions[].accessURL` → `dcat:downloadURL` |
| 発行・更新日 | `timestamp` / `updated` → `dct:issued` / `dct:modified` |
| テーマ分類 | `theme` → `dct:subject` |
| 機械可読メタデータ | DCAT-AP JSON-LD（ハーベスターが RDF に変換） |
| 複数言語 | `site.i18n` + `translation_key`（ランディングはロケール別 HTML） |
| API エンドポイント | 空音範囲外（リンクのみ `accessURL` で記載可） |

**運用上の注意**

- 全国ポータルは通常 **組織の DCAT-AP フィード URL** を登録します。空音サイトの `catalog-dcat.jsonld` を組織の既存カタログにマージするか、中継パイプラインで RDF カタログに変換してください。
- SHACL 完全準拠や Dataset Series は [OKF 0.3 設計](https://github.com/masanork/sorane/blob/main/design/okf-profile-0.3-draft.md) の explicit non-goals です。

## 関連ドキュメント

- [OKF プロファイル](okf-profile.html) — `type: dataset` とビルド出力
- [設定（YAML）](configuration.html#open_data) — `site.open_data`
- [CLI リファレンス](cli.html) — `sorane build` / `sorane validate`