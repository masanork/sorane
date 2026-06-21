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
npx @sorane/cli@0.2.6 validate --cwd .
npx @sorane/cli@0.2.6 build --cwd . --clean
```

## サイトを作る

**おすすめ:** [`template/site/`](https://github.com/masanork/sorane/tree/main/template/site) をコピーするか GitHub テンプレートとして使います。`AGENTS.md` 付きで AI アシスタントとすぐ始められます。

1. `template/site/` を新しいリポジトリに置く
2. 記事を `content/` に追加
3. `validate --json` → `build --clean`
4. `dist/` を Cloudflare Pages 等にデプロイ

AI 向けの詳細は [AI アシスタント向けオンボーディング](ai-onboarding.html)。設定は [設定（sorane.yaml）](configuration.html)。

## sorane 本体の開発

monorepo 全体を扱う場合はリポジトリを clone します。

```bash
git clone https://github.com/masanork/sorane.git
cd sorane
npm ci
npm run build -- --cwd examples/minimal --clean
```