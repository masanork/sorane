---
type: article
title: はじめに
profile: sorane-okf/0.1
excludeFromList: true
---

## 必要環境

- Node.js 23.6 以上

## クイックスタート

sorane は npm で公開されています。`sorane.yaml` があるディレクトリで次を実行します。

```bash
npm install @sorane/cli
npx sorane validate --cwd .
npx sorane build --cwd . --clean
```

検索を使う場合は `npm install @sorane/search` を追加し、`content/search.md`（`view: search`）があるとき `sorane index --force` を実行します。サイト規模の既定値は `sorane.yaml` の `preset:`（`blog` / `okf-site` / `gov`）で選べます — [設定](configuration.html#プリセット)。

## サイトを作る

**おすすめ:** [`template/site/`](https://github.com/masanork/sorane/tree/main/template/site) をコピーするか GitHub テンプレートとして使います。`AGENTS.md` 付きで AI アシスタントとすぐ始められます。

1. `template/site/` を新しいリポジトリに置く
2. 記事を `content/` に追加
3. `validate --json` → `build --clean`
4. `dist/` を Cloudflare Pages 等にデプロイ

機能の全体像は [機能](features.html)。AI 向けの詳細は [AI 向け解説](ai-onboarding.html)。設定は [設定（YAML）](configuration.html)。

## sorane 本体の開発

monorepo 全体を扱う場合はリポジトリを clone します。

```bash
git clone https://github.com/masanork/sorane.git
cd sorane
npm ci
npm run build -- --cwd examples/minimal --clean
```