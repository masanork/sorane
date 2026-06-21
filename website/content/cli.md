---
type: article
title: CLI リファレンス
profile: sorane-okf/0.1
excludeFromList: true
---

すべてのコマンドはプロジェクトルート（`sorane.yaml` があるディレクトリ）を `--cwd` で指定します。例では `npx @sorane/cli@0.2.4` を使います。

## sorane build

静的サイトを生成します。

```bash
npx @sorane/cli@0.2.4 build [--cwd <dir>] [--clean] [--watch]
npx @sorane/cli@0.2.4 watch [--cwd <dir>] [--clean]
```

`--clean` は出力ディレクトリを削除してから再生成します。`--watch`（または `sorane watch`）は `content/` と `sorane.yaml` の変更を監視して再ビルドします（2回目以降は自動で `--clean`）。

`--skip-c2pa` は `build.c2pa.enabled` 時でも静的画像への C2PA 署名を省略します（CI スナップショット向け）。

ビルド完了時に `built N page(s) in X.Xs` と所要時間を表示します。

## sorane validate

frontmatter と OKF プロファイル（`sorane-okf/0.1` / `0.2`）を検証します。

```bash
npx @sorane/cli@0.2.4 validate [--cwd <dir>] [--json]
```

`--json` は AI エージェント向けの構造化レポート（`schema_version: 1`）を stdout に出力します。`ok: false` のとき exit code は非ゼロです。

| `findings[].severity` | 意味 |
|-----------------------|------|
| `error` | 修正必須（OKF / frontmatter） |
| `warning` | 推奨修正（`diagram` alt、`heading` 階層） |

`template/site/AGENTS.md` と `.grok/skills/sorane-content/SKILL.md` がこの JSON 契約を前提にしています。

## sorane migrate

レガシー frontmatter を OKF 形式へ変換します。

```bash
npx @sorane/cli@0.2.4 migrate [--cwd <dir>] [--dry-run] [--bump-profile 0.2]
```

`--bump-profile 0.2` は `profile: sorane-okf/0.2` へ上げるだけで、AI 開示フィールドは追加しません。

## sorane index

検索インデックス（SQLite FTS5、任意でベクトル）を構築します。既定は FTS のみです。

```bash
npx @sorane/cli@0.2.4 index [--cwd <dir>] [--force] [--hybrid] [--fts-only]
```

ハイブリッド（experimental）を使う場合は `search.mode: hybrid` または `--hybrid` と、先に `npm run fetch-model` で ruri-v3-30m を取得してください。

## sorane search

ローカルで検索を試します。

```bash
npx @sorane/cli@0.2.4 search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--k 10] [--json]
```