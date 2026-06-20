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

1. 空のディレクトリに `sorane.yaml` と `content/` を置く
2. `content/index.md`（トップ）と記事 `.md` を書く
3. `sorane build --cwd . --clean` で `dist/` を生成
4. `dist/` を Cloudflare Pages 等にデプロイ

設定の詳細は [設定（sorane.yaml）](configuration.html) を参照してください。