---
type: article
title: CLI リファレンス
profile: sorane-okf/0.1
excludeFromList: true
---

すべてのコマンドはプロジェクトルート（`sorane.yaml` があるディレクトリ）を `--cwd` で指定します。

## sorane build

静的サイトを生成します。

```bash
sorane build [--cwd <dir>] [--clean] [--watch]
sorane watch [--cwd <dir>] [--clean]
```

`--clean` は出力ディレクトリを削除してから再生成します。`--watch`（または `sorane watch`）は `content/` と `sorane.yaml` の変更を監視して再ビルドします（2回目以降は自動で `--clean`）。

`--skip-c2pa` は `build.c2pa.enabled` 時でも静的画像への C2PA 署名を省略します（CI スナップショット向け）。

ビルド完了時に `built N page(s) in X.Xs` と所要時間を表示します。

## sorane validate

frontmatter と OKF プロファイル（`sorane-okf/0.1`）を検証します。

```bash
sorane validate [--cwd <dir>]
```

図表の alt 欠落や見出し階層の飛び（h2 → h4 など）を **warning** で報告します（ビルドは継続）。

## sorane migrate

レガシー frontmatter を OKF 形式へ変換します。

```bash
sorane migrate [--cwd <dir>] [--dry-run] [--bump-profile 0.2]
```

`--bump-profile 0.2` は `profile: sorane-okf/0.2` へ上げるだけで、AI 開示フィールドは追加しません。

## sorane index

検索インデックス（SQLite FTS5、任意でベクトル）を構築します。既定は FTS のみです。

```bash
sorane index [--cwd <dir>] [--force] [--hybrid] [--fts-only]
```

ハイブリッド（experimental）を使う場合は `search.mode: hybrid` または `--hybrid` と、先に `npm run fetch-model` で ruri-v3-30m を取得してください。

## sorane search

ローカルで検索を試します。

```bash
sorane search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--k 10] [--json]
```