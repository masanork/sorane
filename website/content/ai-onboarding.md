---
type: article
title: AI 向け解説
profile: sorane-okf/0.1
excludeFromList: true
---

sorane サイトは管理画面なしで、Markdown と frontmatter を Git で管理します。AI アシスタントは `content/` の編集とビルド検証を担当します。

## テンプレート

[`template/site/`](https://github.com/masanork/sorane/tree/main/template/site) をコピーするか GitHub テンプレートとして使います。

```
template/site/
├── AGENTS.md
├── sorane.yaml
├── content/
└── .github/workflows/pages.yml
```

手順・frontmatter 規約・`validate --json` の契約はリポジトリ直下の `AGENTS.md` にあります。Grok では `/sorane-content` スキルを使えます。

## 典型タスク

1. `content/article/` に記事を追加
2. `npx @sorane/cli validate --cwd . --json` で検証し、すべての `error` を修正
3. 検索ページがある場合は `npx @sorane/cli index --cwd . --force`
4. `npx @sorane/cli build --cwd . --clean` で `dist/` を生成
5. Git push → CI が Pages にデプロイ

## validate --json

stdout を JSON としてパースします。`ok: false` のときは `files[].findings` の `severity: "error"` をすべて直してから再実行します。フィールド定義と例は `AGENTS.md` を参照してください。