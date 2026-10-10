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

## 問い合わせフォーム

`site.contact.form.enabled: true` を指定すると、`site.contact.page` の本文の後に Sorane の問い合わせフォームを生成します。受付には Sorane の受付・管理 Worker と D1 が必要です。Pages 配信では同一オリジンの `/_contact` に専用 Worker を接続でき、静的配信を継続できます。

```yaml
site:
  contact:
    page: contact.html
    form:
      enabled: true
      privacy_notice: 入力内容は問い合わせへの対応に使用し、受付から30日後に削除します。
```

所有者は管理画面の問い合わせ受信箱で確認し、未対応・対応中・対応済みを切り替えられます。メール通知は行いません。受付を明示的に有効にした本番サイトだけが問い合わせを保存でき、プレビューホストは受付対象に含めません。`prepare_contact` を有効にした WebMCP は下書き入力までを行い、送信と同意は利用者が行います。

設定と運用の詳細は [問い合わせ受付の手順](https://github.com/masanork/sorane/blob/main/docs/native-contact.md) を参照してください。

## プリセット

サイトの規模に合わせた既定値をまとめて適用します。`sorane.yaml` の先頭に書きます。

```yaml
preset: blog        # 軽量 SSG（preset 省略時と同じ系統）
preset: okf-site    # 機械可読出力・図表・アーカイブ（ssg.sorane.dev / open-data 向け）
preset: gov         # okf-site + 厳格な validate 品質ゲート
```

| 項目 | 省略 / `blog` | `okf-site` / `gov` |
|------|---------------|---------------------|
| `build.blog.archives` / `tags` | `false` | `true` |
| `build.diagrams.enabled` | `false` | `true` |
| `catalog.jsonld` / `llms.txt` / `okf/bundle` / 各ページ `.md` | off | on |
| `feed.xml` / `sitemap.xml` / `robots.txt` | on | on |
| `build.quality`（`gov` のみ） | 既定 | 画像 alt・リンク文言などを強化（`heading: error`） |

既存の本番サイトで v0.4 以降に出力が減った場合は `preset: okf-site` を追加するか、下記 `build.outputs` で個別に有効化してください。

### `build.redirects`（サイト移行）

旧 URL から新 URL へ転送するルール。ビルド時に `dist/_redirects` を出力します（Cloudflare Pages / Netlify 互換）。詳細は [デプロイ](deployment.html#リダイレクトサイト移行) を参照してください。

```yaml
build:
  redirects:
    - from: /old-slug.html      # または old-slug.html
      to: https://new.example/new-slug.html
      status: 301               # 省略時 301
```

記事 frontmatter の `redirect` / `redirect_status` でも同様のルールを追加できます。同一 `from` が重なる場合は **後勝ち**（frontmatter が config より後）。`sorane validate` は重複を error にします。

### `build.outputs`（個別上書き）

```yaml
build:
  outputs:
    md_alternate: true    # 各 HTML と並ぶ .md 代替
    okf_bundle: true      # okf/bundle.tar.gz
    okfc: true            # okf/site.okfc（OKFC: SQLite + FTS）
    catalog: true         # catalog.jsonld
    llms_txt: true
    feed: true
    sitemap: true
    robots: true
```

未指定のキーは lite 既定（`feed` / `sitemap` / `robots` のみ on）です。`preset: okf-site` は上表のフル出力をまとめて有効にします。

`okfc: true` のとき、公開 concept を共有・配布用の **OKF Container Format**（OKFC）SQLite パックにします（概念 id は `{type}/{slug}`、本文 **FTS5**、見出しチャンク）。これは `sorane index` が管理するローカル作業 DB `.sorane/index.db` とは別の出力です。`better-sqlite3` が無い場合は警告してスキップします。

### `build.okfc`（まとまり単位・registry）

`outputs.okfc: true` のときの詳細。省略時は **サイト全体** `okf/site.okfc` + **サブディレクトリ自動ユニット** + `okf/registry.json` です。

```yaml
build:
  outputs:
    okfc: true
  okfc:
    site: true                 # okf/site.okfc（既定 true）
    auto_directories: true     # content 配下のサブdir（≥ min_entries）ごとに unit（既定 true）
    min_entries: 2
    units_dir: okf/units       # ユニット出力先（out_dir 相対）
    registry: true             # okf/registry.json（既定 true）
    units:                     # 明示ユニット（任意）
      - id: open-data
        title: オープンデータ
        bundle_type: schema-bundle
        match:
          dirs: [datasets]     # content 相対ディレクトリ接頭辞
          types: [dataset, reference]
        # out: okf/units/open-data.okfc  # 省略時 units_dir/id.okfc
```

| 出力 | 内容 |
|------|------|
| `okf/site.okfc` | 全公開 concept（FTS） |
| `okf/units/{id}.okfc` | まとまり単位 |
| `okf/registry.json` | エージェント向けバンドル一覧（`search: "fts"`） |

CLI:

```bash
npx @sorane/cli okfc pack --cwd .
npx @sorane/cli okfc pack --cwd . --unit open-data
npx @sorane/cli search "検索語" --cwd . --okfc dist/okf/site.okfc --k 10
```

## オプショナル npm パッケージ

`@sorane/cli` 単体で `build` / `validate` / `watch` / `export` / `import` は動きます。次は **使う機能のときだけ** 追加インストールします。

| パッケージ | 用途 |
|------------|------|
| `@sorane/search` | `sorane index` / `sorane search`、検索ページ用 `search-index.json` 等 |
| `@sorane/font` | `fonts.enabled: true` の WOFF2 サブセット |
| `mermaid` | `build.diagrams.enabled: true` かつ Mermaid client モード |

未インストール時は `npm install <pkg>`（lockfile に応じて yarn / pnpm）を表示し、TTY ではインストール確認を出します。`sorane index --yes` / `sorane search --yes` で非対話インストールできます。

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
- `kototoi` … Passkey 問い合わせフォーム（[kototoi 運用](kototoi.html)）
- `findability.search_action` … 検索ページがあるとき `SearchAction`（`search.html?q=`）を出力
- 記事 frontmatter（任意）: `identifier`, `subject`, `audience`, `coverage`, `updated`（サイトマップ `lastmod` に反映）

詳細: [design/findability-pack.md](https://github.com/masanork/sorane/blob/main/design/findability-pack.md)

## kototoi（問い合わせフォーム）

静的サイトに [kototoi](https://github.com/masanork/kototoi) を埋め込むときは `kototoi:` 節を追加します。API は別ホスト（例: `ask.sorane.dev`）でも、フォーム JS は空音の `dist/` に同梱します。

```yaml
kototoi:
  endpoint: https://ask.sorane.dev
  site_id: "<uuid>"
  form:
    title: お問い合わせ
    fields: [...]
```

ビルド後スクリプト・CI・クライアント更新・`site sync`・管理者招待などの運用は [kototoi 問い合わせフォーム](kototoi.html) にまとめています。

## サイト全体のライセンス

ドキュメントサイトやブログの **コンテンツ**（`article` / `reference` 等）に適用するライセンスを `sorane.yaml` で宣言できます。`type: dataset` の `license:`（データセット単位）とは別です。

```yaml
site:
  license: MIT                    # SPDX id または HTTPS URI
  license_page: license.html      # 任意。説明ページ（dist 相対）
  copyright_since: 2023           # 任意。初出年（ビルド年と異なれば 2023–2026 と表示）
  copyright_holder: Example Corp  # 任意。著作権者名
  # copyright: "2023–2026 Example Corp"  # 上記の代わりに全文を固定でも可
```

- 全 HTML ページのフッターに `rel="license"` リンクと著作権行を出します
- `copyright_since` / `copyright_holder` はビルド時の UTC 年と組み合わせて範囲を自動生成します（Git 不要）
- トップの WebSite JSON-LD と各記事の CreativeWork JSON-LD に `license` を付与します
- `llms.txt` に License セクションを追加します
- `license_page` を省略したときは `license` の URI（SPDX なら解決後 URL）へリンクします

ssg.sorane.dev の例: [license.html](license.html)（`site.license: MIT`）。

### ドキュメントナビ（`docs.nav`）

サイドバーとトップの「ドキュメント」欄の順序です。`section:` で見出しを挟めます（ニュース欄とは別）。

```yaml
docs:
  nav:
    - section: はじめに
    - getting-started.html
    - features.html
    - section: リファレンス
    - cli.html
    # ...
```

ブログ記事（`excludeFromList` なしの `article`）はナビに載せず、トップのニュース欄と `archive/` に出ます。

### 下書き（`draft`）

```yaml
---
type: article
title: 未公開の告知
draft: true
---
```

`sorane preview`（`--drafts --preview`）でのみ HTML 化されます。通常の `build` / CI デプロイでは出力・feed・サイトマップから除外されます。

## オープンデータ（DCAT カタログ）

`type: dataset` ページ向けに、ポータル連携用の DCAT-AP JSON-LD を追加出力できます（schema.org の `catalog.jsonld` とは別ファイル）。

```yaml
site:
  open_data:
    dcat_catalog: true          # dist/catalog-dcat.jsonld を生成
    default_license: CC-BY-4.0  # 任意。dataset に license が無いときのフォールバック
```

- 有効時、`type: dataset` が 1 件以上あるビルドだけ `catalog-dcat.jsonld` を書き出します
- `llms.txt` に DCAT カタログへのリンクが追加されます
- 実例: [examples/open-data/](https://github.com/masanork/sorane/tree/main/examples/open-data)

## OKF サイト既定（`okf`）

全ページの frontmatter に `profile` を書かなくても、サイト既定の OKF プロファイルで検証・ビルドします。

```yaml
okf:
  default_profile: sorane-okf/0.3
  unknown_type: warn   # warn | error（0.3 の未知 type のみ）
```

- `default_profile` — frontmatter の `profile` 省略時に適用（未設定時は `sorane-okf/0.1`）
- `unknown_type: warn` — 0.3 で未知 `type` は warning のみ（ビルドは `article` 扱い、既定）
- `unknown_type: error` — 未知 `type` を validate エラーに（厳格サイト向け）

## 品質ゲート（validate）

`validate --json` は OKF に加え、公的サイト向けの **warning** を出します（ビルドは継続）。

| category | 内容 |
|----------|------|
| `image` | 本文 `![](path)` の alt 欠落 |
| `link` | 「こちら」「here」など非説明的リンクテキスト |
| `table` | GFM 表のヘッダー区切り行・空ヘッダセル |
| `date` | `timestamp` / `updated` の形式、`updated` \< `timestamp` |
| `diagram` | 図表フェンスの alt 欠落 |
| `heading` | 見出し階層の飛び・本文 h1（`heading: error` で validate 失敗） |
| `lang` | 本文の日英混在・`lang` 属性の形式 |

```yaml
build:
  quality:
    image_alt: true
    link_text: true
    table_headers: true
    dates: true
    heading: warn      # warn（既定）| error | false
    lang_mixing: true
```

`image_alt` などを `false` にすると該当チェックを省略します。

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
- アーカイブ・タグ・ページネーションはロケール別（例: `en/archive/index.html`, `en/tag/slug.html`）
- `validate --json` の `i18n` category で `translation_key` の欠落・不整合を warning

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
| `web_analytics: true` | **Pages Web Analytics**（Workers & Pages → Metrics → Enable）の運用メモ。無料で PV 等が取れるが、デプロイ時に Cloudflare がビーコンを注入する（空音は Markdown/HTML に書かない） |
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
    archives: false          # 既定（preset: okf-site で true）
    tags: false
```

`preset: okf-site` または `gov` では `archives` / `tags` が `true` になります。

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
  webmcp: false  # true で実験的な search_site ツールを公開
```

検索は SQLite FTS5 を使います。モデル不要で軽量です。

### 検索 UI（ヘッダー vs 専用ページ）

| | ヘッダー検索 | `content/search.md`（`view: search`） |
|--|-------------|----------------------------------------|
| いつ | `sorane index` 後、全ページ（専用ページ除く） | コンテンツがある限り常に `search.html` |
| UI | コンパクト（種別 facet なし） | フル UI（記事 / dataset / FAQ… の facet） |
| 用途 | どのページからでもさっと検索 | 絞り込み・説明文・`SearchAction` の安定 URL |

`view: search` の記事があるか、ローカル検索インデックスが存在するとき、検索アセット（`search-index.json` 等）を dist に出力します。`sorane index` を実行したサイトはヘッダー検索を有効にし、ビルド時に現在のコンテンツから検索データを作ります。小さなブログは `search.md` を省略してヘッダー検索のみでも構いません。open-data / 行政向けでは専用ページを残すのが一般的です。

### WebMCP（実験的）

`search.webmcp: true` にすると、検索 UI があるページで、対応ブラウザのエージェントに `search_site` ツールを公開します。既定は `false` で、プリセットでは自動的に有効になりません。空音の製品サイトでは試験的に有効にしています。

ツールは既存の公開検索インデックスを使い、人間の検索と同じ結果を画面に表示します。バックエンドや AI モデルの追加は不要です。WebMCP が使えないブラウザでも通常の検索を利用できます。

| 入力 | 用途 |
|------|------|
| `query` | 必須。空白だけの文字列を除く、1〜512 文字の検索キーワード |
| `type` | 任意。`article` / `dataset` / `reference` / `glossary` / `glossary-term` / `faq` |
| `source` | 任意。`ai-generated` / `human` / `disclosed` |
| `limit` | 任意。1〜20 の整数。既定 10。見出し単位の検索結果数 |
| `tags` | 任意。タグの配列（最大 10 個、各 64 文字）。すべてのタグを持つページに絞る |
| `lang` | 任意。`ja` / `en` などの言語コードと完全一致 |
| `updated_after` / `updated_before` | 任意。`YYYY-MM-DD` の更新日範囲（両端を含む）。日付のないページは除外 |

`type` / `source` は省略または空文字列で絞り込みを解除します。ツールを呼ぶたびに適用し、専用ページでは選択欄、ヘッダーでは検索結果の状態表示に反映します。

応答は `query`、適用した `type` / `source`、返した件数 `count`、`results` のオブジェクトです。各結果にはタイトル `title`、絶対 URL `url`（見出しがあればアンカー付き）、見出し `heading`、抜粋 `snippet`、種別 `doc_type`、ソースパス `source`、スコア `score` が含まれます。開示情報がある場合は `digital_source_type` も返します。該当なしは空配列、索引の読み込み失敗や不正な入力は呼び出しエラーになります。

本番ビルドで除外した下書きは検索対象に入りません。`build.security.search_snippet_only` を有効にしたサイトでは、ツールも同じ抜粋用インデックスを使います。

タグ・言語・更新日は専用検索ページの「詳しい絞り込み」にも反映します。検索は Unicode NFKC、英字の大小、ひらがな／カタカナを正規化します。日本語の同義語や漢字の読みの変換は行いません。結果には利用可能な `tags`、`lang`、`updated` も含めます。更新日はコンテンツの `updated`、なければ `timestamp` を使い、ビルド時刻で補いません。

### WebMCP の追加ツール

`true` は検索だけを公開します。追加機能はオブジェクトで個別に有効化できます。各項目の既定は `false` です。

```yaml
search:
  webmcp:
    read_page: true
    datasets: true
    knowledge_packs: true
    contact: true
```

| ツール | 入力と応答 |
|--------|------------|
| `read_page` | 必須 `url`、任意 `section`（見出しアンカー）。本文または指定節、`toc`、公開日 `timestamp`、更新日 `updated`、出典 `sources`、検証履歴 `verified`、生成情報 `generated`、利用可能な AI 開示を返す。URL のフラグメントでも節を指定可能 |
| `get_dataset` | 必須 `url`。データセットの配布 URL、形式、MIME 型、サイズ、チェックサム、ライセンス、発行者を返す。ファイル自体は取得しない |
| `get_knowledge_pack` | 任意 `url`。生成済み OKFC のダウンロード URL、収録ページ・種別・タグ・言語を返す。ページを指定すると、そのページを収録するパックだけを小さい順に提示 |
| `prepare_contact` | 必須 `fields`（フィールド名と文字列のオブジェクト）、任意 `overwrite`。表示中の問い合わせフォームに下書きを入力する。既存の値の上書きは既定で拒否し、送信は利用者が行う |

読み取り系の URL は検索結果から渡せます。サイト内の公開ページだけを対象とし、未公開ページや別オリジンは拒否します。取得結果はページ内にも表示します。`get_knowledge_pack` の利用には `build.outputs.okfc: true` が必要です。パックが未生成の場合は空配列を返します。

追加データは公開対象の Knowledge IR から `assets/webmcp-content.json` に生成します。**本文の公開には `read_page: true` が必要です。** `search_snippet_only: true` でもこの明示設定を行うと、別 JSON に本文を含めます。抜粋だけを公開したいサイトでは `read_page` を有効にしないでください。`datasets` / `knowledge_packs` だけでは本文を含めません。AI 開示は `build.ai_disclosure.machine_readable` に従います。

問い合わせ補助は、フォームまたはその親要素に `data-webmcp-contact` を付けて利用します。編集可能な表示中の text / email / tel / url 入力欄と textarea だけを扱い、隠し項目、ログイン、送信処理には触れません。動的にフォームが現れると登録し、消えると解除します。空音の製品サイトでは Kototoi の埋め込み先をマークし、ログイン後の新規問い合わせフォームで利用できます。

WebMCP は変更のあるドラフト仕様です。現在は `document.modelContext.registerTool()` を使います。手元で試す場合は Chrome の `chrome://flags/#enable-webmcp-testing` を有効にし、対応エージェントまたはツール検査機能で `search_site` を呼び出してください。[Chrome 公式ガイド](https://developer.chrome.com/docs/ai/webmcp)

## 図表

Markdown のコードフェンスで図を書けます。ソースは `.md` 代替ファイルと OKF バンドルにそのまま残ります。

既定は `build.diagrams.enabled: false`（`preset: okf-site` で `true`）。有効化時は `mermaid` パッケージが必要です（client モード）。

```yaml
build:
  diagrams:
    enabled: true
    mermaid:
      mode: client    # client | build | off
      mmdc: mmdc      # mermaid.mode: build 時の CLI（既定は @mermaid-js/mermaid-cli）
```

- ` ```mermaid ` … `mode: client`（既定）ではクライアント描画（`sorane-mermaid-loader.mjs` を条件付き読み込み）
- `mermaid.mode: build` … `@mermaid-js/mermaid-cli`（mmdc + Chromium）でビルド時 SVG（`assets/diagrams/mermaid/{hash}.svg`）。クライアント loader は不要
- `alt="..."` を info string に付けるか、`%% alt: 説明` コメントで代替テキストを指定
- client モードではブラウザー描画、build モードでは mmdc による静的 SVG

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
