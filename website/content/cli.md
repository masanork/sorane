---
type: article
title: CLI リファレンス
profile: sorane-okf/0.1
excludeFromList: true
---

すべてのコマンドはプロジェクトルート（`sorane.yaml` があるディレクトリ）を `--cwd` で指定します。例では `npx @sorane/cli`（npm の最新版）を使います。CI でバージョン固定する場合は `@sorane/cli@x.y.z` を付けてください。

## オプショナルパッケージ

| コマンド / 設定 | 追加パッケージ |
|-----------------|----------------|
| `index` / `search` | `@sorane/search` |
| `fonts.enabled: true` | `@sorane/font` |
| `build.diagrams.enabled: true`（client） | `mermaid` |

未インストール時は `npm install <pkg>` を表示します（yarn / pnpm は lockfile から自動判定）。対話端末ではインストール確認が出ます。`index` / `search` では `--yes`（または `-y`）で確認なしインストールできます。

```bash
npm install @sorane/cli @sorane/search   # 検索まで使うサイト
```

## sorane build

静的サイトを生成します。

```bash
npx @sorane/cli build [--cwd <dir>] [--clean] [--watch] [--drafts] [--preview]
npx @sorane/cli watch [--cwd <dir>] [--clean] [--drafts] [--preview]
npx @sorane/cli preview [--cwd <dir>] [--port 4321] [--watch]
```

`--clean` は出力ディレクトリを削除してから再生成します。`--watch`（または `sorane watch`）は `content/` と `sorane.yaml` の変更を監視して再ビルドします（2回目以降は自動で `--clean`）。

### ローカルプレビュー

```bash
npx @sorane/cli preview --cwd . --watch
```

`dist/` をビルドして `http://127.0.0.1:4321/` で配信します。`--watch` で保存のたびに再ビルドします。プレビューでは `draft: true` の記事も含め、全ページに「ローカルプレビュー」バナーを付けます。本番の `build`（CI デプロイ）では `draft: true` は **出力されません**。

`--skip-c2pa` は `build.c2pa.enabled` 時でも静的画像への C2PA 署名を省略します（CI スナップショット向け）。

ビルド完了時に `built N page(s) in X.Xs` と所要時間を表示します。

## sorane validate

frontmatter と OKF プロファイル（`sorane-okf/0.1` / `0.2` / `0.3`）を検証します。

```bash
npx @sorane/cli validate [--cwd <dir>] [--json]
```

`--json` は AI エージェント向けの構造化レポート（`schema_version: 1`）を stdout に出力します。`ok: false` のとき exit code は非ゼロです。

| `findings[].severity` | 意味 |
|-----------------------|------|
| `error` | 修正必須（OKF / frontmatter） |
| `warning` | 推奨修正（下表の `category`） |

| `findings[].category` | 内容 |
|-----------------------|------|
| `okf` | プロファイル・必須 frontmatter |
| `diagram` | 図表フェンスの alt 欠落 |
| `heading` | 見出し階層の飛び・本文 h1 |
| `image` | 本文画像の alt 欠落 |
| `link` | 非説明的リンクテキスト |
| `table` | GFM 表のヘッダー不備 |
| `date` | `timestamp` / `updated` の形式・順序 |
| `revision` | `revisions` 配列の形式・日付・要約・並び |
| `faq` | `type: faq` の `##` 質問見出し・回答の構造 |
| `glossary` | `type: glossary` / `glossary-term` の構造・推奨 frontmatter |
| `reference` | `type: reference` の `description` / `resource` 推奨・GFM 表 |
| `dataset` | `type: dataset` のライセンス・distribution URL など |
| `i18n` | `translation_key` と `site.i18n` ロケールの整合性 |
| `lang` | 本文の言語混在・`lang` 属性の形式 |

`build.quality` で `image` / `link` / `table` / `date` / `lang_mixing` の warning を個別に無効化できます。`heading: error` で見出し階層を error に昇格できます（[設定](configuration.html#品質ゲートvalidate)）。

`template/site/AGENTS.md` と `.grok/skills/sorane-content/SKILL.md` がこの JSON 契約を前提にしています。

## sorane migrate

レガシー frontmatter を OKF 形式へ変換します。

```bash
npx @sorane/cli migrate [--cwd <dir>] [--dry-run] [--bump-profile 0.2|0.3]
```

`--bump-profile` は `profile: sorane-okf/<version>` へ上げるだけで、AI 開示や dataset 用フィールドは追加しません。

## sorane index

SQLite FTS5 の検索インデックスを構築します。

```bash
npx @sorane/cli index [--cwd <dir>] [--force] [--drafts] [--yes]
```

要 `@sorane/search`（未導入時は上記オプショナルパッケージの案内）。

`draft: true` のページは既定で索引に入りません（本番で公開しないコンテンツ）。ローカル確認だけ含めたいときは `--drafts` を付けます（`build --drafts` と同じ意味）。

## sorane search

ローカルで検索を試します。**ビルド成果物の `okf/site.okfc` があればそれを優先**し（U4）、無ければ `.sorane/index.db` にフォールバックします。

```bash
npx @sorane/cli search <query> [--cwd <dir>] \
  [--okfc <path>] [--prefer-index] [--index <path>] \
  [--type article|dataset|reference|glossary|glossary-term|faq] \
  [--tag <slug>] [--k 10] [--json]
```

| フラグ | 意味 |
|--------|------|
| （既定） | `{out_dir}/okf/site.okfc` があれば OKFC FTS、なければ index.db |
| `--okfc <path>` | 指定 OKFC を強制 |
| `--prefer-index` | 常に index.db（`--index` / `search.index`） |
| `--index` / `--out` | index.db パス（`.okfc` で終わる場合は OKFC） |

OKFC 経路は `better-sqlite3`（`@sorane/okf` の optional）で FTS 検索します。index.db 経路は `@sorane/search` が必要です。

サイトの検索ページでは、一度索引を読み込めば **Service Worker によりオフライン FTS** が使えます。`outputs.okfc` が有効なときは **site.okfc のダウンロード**リンクも出ます（CLI と同じ知識パック）。
