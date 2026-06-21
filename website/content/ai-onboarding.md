---
type: article
title: AI アシスタント向けオンボーディング
profile: sorane-okf/0.1
excludeFromList: true
---

sorane サイトは **管理画面なし・GitHub 前提** です。ライトユーザーは Cursor、Claude Code、Antigravity などのエージェントに `content/` の編集を任せます。

エージェント向けドキュメントでは **手順・規約・コマンド** を優先します。他ツールとの比較や個別プロダクト名の列挙は載せません（判断材料にならず、陳腐化しやすいため）。

## テンプレート

リポジトリの [`template/site/`](https://github.com/masanork/sorane/tree/main/template/site) をベースに、コンテンツ用リポジトリを作ります。

```
template/site/
├── AGENTS.md              … 全エージェント共通（本体）
├── CLAUDE.md              … Claude Code 用ポインタ
├── GEMINI.md              … Antigravity 用ポインタ
├── .cursor/rules/sorane.mdc
├── sorane.yaml
├── content/
└── .github/workflows/pages.yml
```

**GitHub → Use this template** で配布するか、ディレクトリをコピーして使います。

## なぜ AGENTS.md を軸にするか

[AGENTS.md](https://agents.md/) は Cursor・Claude Code・Antigravity・Codex などが読める共通フォーマットです。エディター専用 UI の代わりに、**リポジトリ内の指示書**がオンボーディングになります。

| ツール | 読むファイル |
|--------|----------------|
| Cursor | `AGENTS.md` + `.cursor/rules/sorane.mdc` |
| Claude Code | `CLAUDE.md` → `AGENTS.md` |
| Antigravity | `AGENTS.md`（`GEMINI.md` は補助） |
| その他 | `AGENTS.md` |

## エージェントの典型タスク

1. `content/article/` に記事を追加（frontmatter 付き Markdown）
2. **`sorane validate --cwd . --json`** で OKF を検証（stdout をパースし `error` をすべて修正）
3. 検索を使う場合は `sorane index --force`
4. `sorane build --clean` で `dist/` を生成
5. Git push → CI が Pages にデプロイ

詳細な frontmatter 規則・JSON 契約・禁止事項は `template/site/AGENTS.md` に書いてあります。Grok では `/sorane-content` スキル（`.grok/skills/sorane-content/SKILL.md`）を使えます。

## sorane 本体の置き方

**推奨（npm）:**

```bash
npx @sorane/cli@0.2.2 validate --cwd . --json
npx @sorane/cli@0.2.2 build --cwd . --clean
```

CI ではテンプレートの `pages.yml` と同様に `npx @sorane/cli` を使えます。fork や monorepo で sorane ソースを pin する場合は、リポジトリ checkout + `SORANE_ROOT`（`AGENTS.md` 参照）でも構いません。