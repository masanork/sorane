---
type: article
title: 図表（Mermaid 他）
profile: sorane-okf/0.1
excludeFromList: true
---

sorane は Markdown のコードフェンスで書いた図を HTML で表示します。ソースは `.md` 代替ファイルと OKF バンドルにそのまま残ります（bunsen Strategy A）。

## Mermaid（クライアント）

` ```mermaid ` フェンスを使います。`alt` は info string または `%% alt:` コメントで指定できます。

```mermaid alt="AI 開示のデータフロー"
flowchart LR
  FM[YAML frontmatter] --> PARSE[parseAiDisclosure]
  PARSE --> JSONLD[BlogPosting JSON-LD]
  PARSE --> HTML[EU バッジ]
  JSONLD --> AGENTS[エージェント]
  HTML --> HUMAN[読者]
```

## シーケンス図

```mermaid alt="ビルドパイプライン"
sequenceDiagram
  participant MD as content/*.md
  participant BUILD as runBuild
  participant DIST as dist/
  MD->>BUILD: parse + render
  BUILD->>DIST: HTML + assets/diagrams/
```

## Mermaid（ビルド時）

`mermaid.mode: build` にすると `@mermaid-js/mermaid-cli`（mmdc）で SVG を生成します。クライアント loader は不要です。

[ssg.sorane.dev](https://ssg.sorane.dev/) は Pages ビルドを軽く保つため **client モード**を使っています（このページの Mermaid はクライアント描画）。CI で Chromium を入れられるサイトは build モードも選べます。詳細は [デプロイ](deployment.html#図表d2--mermaid) を参照してください。

```yaml
build:
  diagrams:
    mermaid:
      mode: build
      mmdc: mmdc
```

## Graphviz（ビルド時）

`build.diagrams.graphviz.enabled: true` と Graphviz `dot` CLI が必要です。

```dot alt="依存関係"
digraph G {
  render -> build
  build -> dist
}
```

## D2（ビルド時）

` ```d2 ` フェンスはビルド時に SVG へコンパイルします（`build.diagrams.d2.enabled: true` と `d2` CLI が必要）。

```d2 alt="シンプルなトポロジ"
sorane: {
  shape: rectangle
}
build: {
  shape: rectangle
}
sorane -> build: render
```

## 設定

`build.diagrams` で有効化・モードを切り替えます。詳細は [設定](configuration.html) を参照してください。