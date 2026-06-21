---
type: article
title: 設定（YAML）
profile: sorane-okf/0.1
excludeFromList: true
---

## 最小構成

```yaml
site:
  title: My Site
  description: Site description
  base_url: https://example.pages.dev
  lang: ja
  og_image: /assets/og-default.png   # 任意。要 base_url

build:
  content_dir: content
  out_dir: dist
  permalink: "{{slug}}.html"
```

記事ごとに `og_image` frontmatter で上書きできます（絶対 URL またはサイトルート相対パス）。

## 発見性（findability）

公的サイト向けに JSON-LD・サイトマップ・`llms.txt` を強化します。

```yaml
site:
  organization:
    name: Example Agency
    url: https://www.example.go.jp/
    type: GovernmentOrganization
  contact:
    page: contact.html
    email: info@example.go.jp
  findability:
    breadcrumbs: true
    search_action: true
    disallow:
      - /assets/search/lib/
```

- `organization` … `WebSite` / 記事 JSON-LD / `catalog.jsonld` / `llms.txt` の発行主体
- `contact` … `llms.txt` の問い合わせ先
- `findability.search_action` … 検索ページがあるとき `SearchAction`（`search.html?q=`）を出力
- 記事 frontmatter（任意）: `identifier`, `subject`, `audience`, `coverage`, `updated`（サイトマップ `lastmod` に反映）

詳細: [design/findability-pack.md](https://github.com/masanork/sorane/blob/main/design/findability-pack.md)

## 品質ゲート（validate）

`validate --json` は OKF に加え、公的サイト向けの **warning** を出します（ビルドは継続）。

| category | 内容 |
|----------|------|
| `image` | 本文 `![](path)` の alt 欠落 |
| `link` | 「こちら」「here」など非説明的リンクテキスト |
| `table` | GFM 表のヘッダー区切り行・空ヘッダセル |
| `date` | `timestamp` / `updated` の形式、`updated` \< `timestamp` |
| `diagram` | 図表フェンスの alt 欠落 |
| `heading` | 見出し階層の飛び・本文 h1 |

```yaml
build:
  quality:
    image_alt: true
    link_text: true
    table_headers: true
    dates: true
```

いずれかを `false` にすると該当チェックを省略します。

## 多言語（i18n）

`site.i18n` でロケール別のコンテンツパスと `hreflang` を出力します。

```yaml
site:
  lang: ja
  base_url: https://www.example.go.jp/
  i18n:
    default: ja
    locales:
      en:
        lang: en
        path_prefix: en
```

- **既定ロケール** … `content/` 直下（例: `content/about.md` → `about.html`）
- **その他** … `content/{path_prefix}/` に同じ相対パスを置く（例: `content/en/about.md` → `en/about.html`）
- ファイル名が異なる場合は frontmatter の `translation_key` で翻訳ペアをグループ化
- ページごとの `lang` frontmatter で `<html lang>` を上書き可能
- アーカイブ・タグ一覧は現状、既定ロケールのみ

詳細: [design/i18n.md](https://github.com/masanork/sorane/blob/main/design/i18n.md)

## 緊急バナー

サイト全体のお知らせを全ページのヘッダー直前に表示します（`role="alert"`）。

```yaml
site:
  emergency:
    message: ただいまメンテナンス中です。
    severity: warning   # info | warning | emergency
    href: https://status.example.go.jp/
    link_text: 状況ページ
    locales:
      en:
        message: Scheduled maintenance in progress.
        href: https://status.example.go.jp/en
        link_text: Status page
```

`message` を省略または空にするとバナーは出ません。`locales` のキーは `site.i18n.locales` の ID と一致させます。

## 改訂履歴

記事 frontmatter の `revisions` でページ下部に更新履歴テーブルを出せます。

```yaml
revisions:
  - date: 2025-06-15
    summary: 誤字を修正
  - date: 2025-06-01
    summary: 初版公開
```

`validate --json` の `revision` category は配列形式・日付・要約・新しい順を warning で確認します（`note` / `updated` はエイリアス可）。

## Cloudflare ホスティング

Pages デプロイ向けの運用メタをビルドに含めます（HTML にトラッキング JS は埋め込みません）。

```yaml
site:
  hosting:
    provider: cloudflare
    cloudflare:
      pages_project: my-site
      zone_name: www.example.go.jp
      web_analytics: true
      logpush:
        destination: r2
        r2_bucket: my-site-access-logs
        exclude_paths:
          - /assets/search/lib/
```

| 項目 | 用途 |
|------|------|
| `web_analytics: true` | **Pages Web Analytics**（Workers & Pages → Metrics → Enable）の運用メモ。無料で PV 等が取れるが、デプロイ時に Cloudflare がビーコンを注入する（sorane は Markdown/HTML に書かない） |
| （参考）ゾーン HTTP Traffic | エッジの Requests / Unique visitors は無料。Page views・Visits の詳細は **Pro 以上**（ダッシュボードの Upgrade 表示はこちら） |
| `logpush` | 監査向け生ログを R2 に保存（任意・解析だけなら不要） |

`sorane build` で `dist/ops/cloudflare.json` と `llms.txt` の Access logs 節が出力されます。`logpush.exclude_paths` は `site.findability.disallow` とマージされます。

## 404 ページ

ビルドは常に `404.html` を `out_dir` 直下に出力します。`content/404.md` で本文をカスタムできます（詳細は [デプロイ](deployment.html)）。

## ブログ機能

```yaml
build:
  blog:
    page_size: 50
    index_archive_limit: 15
    featured_mode: excerpt   # excerpt | full | off
    excerpt_length: 400
    archives: true
    tags: true
```

## フォントサブセット

ページごとに WOFF2 サブセットを埋め込みます（bunsen WASM）。

```yaml
fonts:
  enabled: true
  cache_dir: .sorane/cache/fonts
  skip_key: noFontEmbedding
  roles:
    body: ["Noto Sans JP"]
  sources:
    "Noto Sans JP":
      source: assets/fonts/NotoSansJP-VF.ttf
      weight: "100 900"
```

frontmatter で `noFontEmbedding: true` を指定したページはシステムフォントを使います。

## 検索

標準は FTS（キーワード検索）です。モデル不要で軽量です。

```yaml
search:
  index: .sorane/index.db
```

ハイブリッド（自然文 RAG）は experimental です。埋め込みモデルとランタイム（約 24MB）が必要です。

```yaml
search:
  mode: hybrid                 # experimental
  index: .sorane/index.db
  model: vendor/models
  model_id: ruri-v3-30m
  bundle_model: false          # Cloudflare Pages 25MiB 制限対策
  asset_base_url: ""           # R2 等に ONNX を置く場合
```

- `sorane index` … FTS（既定）
- `sorane index --hybrid` … ベクトル付きインデックス（要 `npm run fetch-model`）

検索 UI は `view: search` を持つ記事ページで有効になります。

## 図表

Markdown のコードフェンスで図を書けます。ソースは `.md` 代替ファイルと OKF バンドルにそのまま残ります。

```yaml
build:
  diagrams:
    enabled: true
    mermaid:
      mode: client    # client | build | off
      mmdc: mmdc      # mermaid.mode: build 時の CLI（既定は @mermaid-js/mermaid-cli）
    d2:
      enabled: false
      binary: d2
    graphviz:
      enabled: false
      binary: dot
```

- ` ```mermaid ` … `mode: client`（既定）ではクライアント描画（`sorane-mermaid-loader.mjs` を条件付き読み込み）
- `mermaid.mode: build` … `@mermaid-js/mermaid-cli`（mmdc + Chromium）でビルド時 SVG（`assets/diagrams/mermaid/{hash}.svg`）。クライアント loader は不要
- `alt="..."` を info string に付けるか、`%% alt: 説明` コメントで代替テキストを指定
- `d2.enabled: true` … `d2` CLI でビルド時 SVG（`assets/diagrams/d2/{hash}.svg`）
- ` ```graphviz ` / ` ```dot ` … `graphviz.enabled: true` かつ `dot` が PATH にあるときビルド時 SVG
- いずれのバックエンドも CLI 欠落時は警告のうえ `<pre><code>` フォールバック（ビルドは継続）

詳細と例は [図表](diagrams.html) を参照してください。`sorane validate` は alt 欠落の図表フェンスを warning で報告します。

## AI 開示

`profile: sorane-okf/0.2` と frontmatter で IPTC / schema.org 準拠の開示ができます。詳細は [AI 開示](ai-disclosure.html) を参照してください。

## 静的画像 IPTC XMP

```yaml
build:
  image_metadata:
    enabled: false
    exiftool: exiftool
    manifest: asset-provenance.yaml   # content/ からの相対（既定）
```

`content/asset-provenance.yaml` と組み合わせて `static/` 内の JPEG/PNG/WebP に IPTC Extension XMP を埋め込みます。詳細は [AI 開示](ai-disclosure.html) を参照してください。

## 静的画像 C2PA

```yaml
build:
  c2pa:
    enabled: false
    embed: true
    binary: c2patool
```

`content/asset-provenance.yaml` と組み合わせて `static/` 内の JPEG/PNG に署名します。`sorane build --skip-c2pa` で CI スナップショット向けに署名を省略できます。