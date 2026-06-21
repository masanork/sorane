---
type: article
title: CLI リファレンス
profile: sorane-okf/0.1
excludeFromList: true
---

すべてのコマンドはプロジェクトルート（`sorane.yaml` があるディレクトリ）を `--cwd` で指定します。例では `npx @sorane/cli`（npm の最新版）を使います。CI でバージョン固定する場合は `@sorane/cli@x.y.z` を付けてください。

## sorane build

静的サイトを生成します。

```bash
npx @sorane/cli build [--cwd <dir>] [--clean] [--watch]
npx @sorane/cli watch [--cwd <dir>] [--clean]
```

`--clean` は出力ディレクトリを削除してから再生成します。`--watch`（または `sorane watch`）は `content/` と `sorane.yaml` の変更を監視して再ビルドします（2回目以降は自動で `--clean`）。

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

`build.quality` で `image` / `link` / `table` / `date` の warning を個別に無効化できます（[設定](configuration.html#品質ゲートvalidate)）。

`template/site/AGENTS.md` と `.grok/skills/sorane-content/SKILL.md` がこの JSON 契約を前提にしています。

## sorane migrate

レガシー frontmatter を OKF 形式へ変換します。

```bash
npx @sorane/cli migrate [--cwd <dir>] [--dry-run] [--bump-profile 0.2|0.3]
```

`--bump-profile` は `profile: sorane-okf/<version>` へ上げるだけで、AI 開示や dataset 用フィールドは追加しません。

## sorane index

検索インデックス（SQLite FTS5、任意でベクトル）を構築します。既定は FTS のみです。

```bash
npx @sorane/cli index [--cwd <dir>] [--force] [--hybrid] [--fts-only]
```

ハイブリッド（experimental）を使う場合は `search.mode: hybrid` または `--hybrid` と、先に `npm run fetch-model` で ruri-v3-30m を取得してください。

## sorane search

ローカルで検索を試します。

```bash
npx @sorane/cli search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--k 10] [--json]
```