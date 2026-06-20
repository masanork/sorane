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
sorane build [--cwd <dir>] [--clean]
```

`--clean` は出力ディレクトリを削除してから再生成します。

## sorane validate

frontmatter と OKF プロファイル（`sorane-okf/0.1`）を検証します。

```bash
sorane validate [--cwd <dir>]
```

## sorane migrate

レガシー frontmatter を OKF 形式へ変換します。

```bash
sorane migrate [--cwd <dir>] [--dry-run]
```

## sorane index

検索インデックス（SQLite FTS5 + 任意でベクトル）を構築します。

```bash
sorane index [--cwd <dir>] [--force] [--fts-only]
```

ハイブリッド検索を使う場合は、先に `npm run fetch-model` で ruri-v3-30m を取得してください。

## sorane search

ローカルで検索を試します。

```bash
sorane search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--k 10] [--json]
```