---
type: article
title: AI アシスタント向けオンボーディング
profile: sorane-okf/0.1
excludeFromList: true
---

sorane サイトは **管理画面なし・GitHub 前提** です。ライトユーザーは Cursor、Claude Code、Antigravity などのエージェントに `content/` の編集を任せます。

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
2. `sorane validate --cwd .` で OKF を検証
3. 検索を使う場合は `sorane index --force`
4. `sorane build --clean` で `dist/` を生成
5. Git push → CI が Pages にデプロイ

詳細な frontmatter 規則と禁止事項は `template/site/AGENTS.md` に書いてあります。

## sorane 本体の置き方

npm 未公開の間は、CI で sorane リポジトリを checkout する形が公式です（テンプレートの `pages.yml` 参照）。ローカルでは sorane を隣のディレクトリに clone し、`AGENTS.md` の `SORANE_ROOT` を使います。

## 競合との違い（短く）

- WordPress / しらさぎ … 管理画面・組織運用（非競合）
- Tina / Decap … Git + GUI 編集（sorane はエディターを捨てる）
- sorane … **エージェントが Markdown を編集し、OKF 副産物付き HTML を出す**