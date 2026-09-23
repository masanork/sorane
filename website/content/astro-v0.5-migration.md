---
type: article
title: Astro 連携 v0.5 からの移行
profile: sorane-okf/0.1
excludeFromList: true
---

次回版以降、空音のリポジトリと配布パッケージから `@sorane/astro` と専用バックエンドを削除します。v0.5.0 で Astro 連携を使っているサイトには、次の二つの移行方法があります。

## v0.5.0 を固定して使い続ける

Astro でのページ描画と sorane の公開成果物をそのまま使う場合は、`@sorane/astro@0.5.0` と依存関係を lockfile に固定してください。次回版以降の機能追加・修正はこの統合には入りません。

```bash
npm install --save-exact @sorane/astro@0.5.0
```

既存の `astro.config.*`、`src/content/`、`soraneAstro(...)` 設定は維持できます。再現可能なビルドのため、Astro と他の `@sorane/*` パッケージも lockfile で固定します。

## sorane の静的サイト生成へ移る

Astro のページコンポーネントやクライアント機能を使っていない Markdown 中心のサイトでは、空音の CLI に切り替えられます。

1. `src/content/` の Markdown を sorane の `content/` に移します。OKF frontmatter はそのまま使えます。
2. `sorane.yaml` にサイト情報、`build.content_dir`、公開 URL、必要な出力 preset を設定します。
3. Astro のページ・layout に埋め込んでいた独自 UI は、sorane の出力で代替できるか確認します。Astro コンポーネントや MDX の実行機能に依存するページは、そのまま移行できません。
4. `sorane validate` と `sorane build --clean` を実行し、URL と公開成果物を確認します。

```bash
npm install @sorane/cli
npx sorane validate --cwd ./my-site
npx sorane build --cwd ./my-site --clean
```

機械可読な出力を維持するには `preset: okf-site` を設定するか、`build.outputs` で必要な出力を有効にします。検索を使う場合は `@sorane/search` を追加して `sorane index` を実行します。

## Astro を継続する

Astro を継続する場合、ページ生成は Astro のままにし、RSS、検索、catalog、OKF bundle など必要な成果物を Astro 側の統合やビルドスクリプトで生成してください。v0.5.0 の `@sorane/astro` の成果物生成を、新しい sorane CLI と同じ出力・ルート対応で置き換える統合は提供しません。

## 公開前に確認すること

- `@sorane/astro` を前提にした CI コマンドと npm 依存を見直す。
- `astro.config.*` の `soraneAstro(...)` を削除するか、v0.5.0 に固定する。
- `catalog.jsonld`、`llms.txt`、`okf/bundle.tar.gz`、`okf/site.okfc`、feed、robots、検索 index のうち、実際に配信している成果物を確認する。
- `draft: true` の記事を配信していないことを確認する。

