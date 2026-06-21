---
type: article
title: 機能
profile: sorane-okf/0.1
excludeFromList: true
---

sorane は **OKF（Open Knowledge Format）ネイティブ**の静的サイトジェネレータです。Markdown を書くだけで、人間向け HTML とエージェント向けの機械可読出力を同じビルドから得られます。

## OKF と機械可読出力

| 出力 | 用途 |
|------|------|
| HTML + `.md` 代替 | 人間の閲覧とエージェントのテキスト取得 |
| `catalog.jsonld` | サイト全体の構造化カタログ（schema.org） |
| `llms.txt` | LLM / エージェント向けサイト要約とリンク |
| `okf/bundle.tar.gz` | OKF プロファイル準拠のコンテンツバンドル |
| `sitemap.xml` / `robots.txt` / `feed.xml` | 検索エンジン・購読 |

プロファイルは `sorane-okf/0.1`〜`0.3`。`0.3` では `dataset`・`reference`・`glossary`・`faq` など公開データ向けの概念型を追加しています（[OKF プロファイル](okf-profile.html)）。

## エージェントと Git ワークフロー

- 管理画面なし — `content/` と `sorane.yaml` を Git で編集
- `sorane validate --json` — 構造化レポート（OKF エラー + 品質 warning）
- [`template/site/`](https://github.com/masanork/sorane/tree/main/template/site) に `AGENTS.md` と CI テンプレート付属

AI アシスタント向けの手順は [AI 向け解説](ai-onboarding.html)。

## 公的サイト・発見性（Findability）

組織サイトや政府系サイト向けに、検索・エージェント・構造化データをまとめて強化できます。

- **発行主体** — `site.organization` / `contact` → JSON-LD・`llms.txt`
- **パンくず・サイト内検索** — `BreadcrumbList`、`SearchAction`（`search.html?q=`）
- **記事メタ** — `identifier` / `subject` / `audience` / `coverage` / `updated`
- **多言語** — `site.i18n`、ロケール別 `content/`、`hreflang` / `og:locale:alternate`
- **運用** — 全ページ緊急バナー（`site.emergency`）、記事の改訂履歴（`revisions`）
- **品質ゲート** — 画像 alt、リンク文言、表ヘッダー、日付、改訂履歴の validate warning

設定の詳細は [設定（YAML）](configuration.html)。

## 検索

- **FTS（標準）** — SQLite ベースのキーワード検索。モデル不要
- **ハイブリッド（experimental）** — 埋め込み + FTS。大規模サイトは ONNX を CDN 配信可能

検索 UI は `view: search` の記事ページで有効化します。

## 図表

ソースは常に Markdown のコードフェンスに残り、HTML はプレゼンテーション層です。

- **Mermaid** — クライアント描画（既定）またはビルド時 SVG（`mmdc`）
- **D2** — ビルド時 SVG（`d2` CLI）
- **Graphviz** — ビルド時 SVG（`dot`）

[図表](diagrams.html) を参照。

## AI コンテンツ開示

`profile: sorane-okf/0.2` 以降で、EU 系の開示要件に沿ったメタデータを扱えます。

- 記事 frontmatter → HTML バッジ + `digitalSourceType`（JSON-LD / 検索 / カタログ）
- 静的画像 — IPTC XMP 埋め込み、C2PA 署名（opt-in）
- `associatedMedia` でインライン画像と開示情報を JSON-LD に連携

[AI 開示](ai-disclosure.html)。

## フォント・表示

- ページ単位の WOFF2 サブセット埋め込み（`@sorane/font`）
- スキップリンク、セマンティック HTML、カスタム `404.md`
- ブログ一覧・アーカイブ・タグ（任意）

## ホスティング連携

Cloudflare Pages 向けに、HTML にトラッキングを埋め込まず運用メタを出力できます。

- `dist/ops/cloudflare.json` — Pages プロジェクト・ゾーン・解析の目印
- 任意で Logpush → R2（監査用アクセスログ）

[デプロイ](deployment.html)。

## 次のステップ

- [はじめに](getting-started.html) — インストールと最初のビルド
- [CLI リファレンス](cli.html) — コマンド一覧
- [リリースと配布](releases.html) — npm パッケージとバージョン