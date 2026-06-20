---
type: article
title: はじめに
profile: sorane-okf/0.1
excludeFromList: true
---

## 必要環境

- Node.js 23.6 以上

## インストール

現時点（v0.1）では npm パッケージとしては未公開です。リポジトリを clone して依存関係を入れます。

```bash
git clone https://github.com/masanork/sorane.git
cd sorane
npm ci
```

## 最初のビルド

同梱の minimal 例で動作確認できます。

```bash
npm run build -- --cwd examples/minimal --clean
# → examples/minimal/dist/ に HTML が出力される
```

## 自分のサイトを作る

**おすすめ:** [`template/site/`](https://github.com/masanork/sorane/tree/main/template/site) をコピーするか GitHub テンプレートとして使う。`AGENTS.md` 付きで Cursor / Claude / Antigravity 向けにすぐ始められます。

1. `template/site/` を新しいリポジトリに置く（`sorane.yaml` + `content/` + `AGENTS.md`）
2. 記事を `content/` に追加（または AI アシスタントに任せる）
3. `sorane validate` → `sorane build --cwd . --clean`
4. `dist/` を Cloudflare Pages 等にデプロイ

AI 向けの詳細は [AI アシスタント向けオンボーディング](ai-onboarding.html) を参照してください。設定は [設定（sorane.yaml）](configuration.html) を参照してください。