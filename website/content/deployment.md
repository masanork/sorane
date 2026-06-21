---
type: article
title: デプロイ
profile: sorane-okf/0.1
excludeFromList: true
---

## Cloudflare Pages

サイト用リポジトリの CI では npm から sorane を呼び出します。テンプレートは `template/site/.github/workflows/pages.yml` を参照してください。

```yaml
# .github/workflows/pages.yml
- checkout サイト repo
- setup-node 23
- npx @sorane/cli@0.2.7 validate --cwd . --json
- npx @sorane/cli@0.2.7 index --cwd . --force   # 検索ページがある場合
- npx @sorane/cli@0.2.7 build --cwd . --clean
- wrangler pages deploy dist --project-name <name>
```

初回のみ Cloudflare で Pages プロジェクトを作成してください。シークレットに `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を設定します。

[sorane 公式サイト](https://sorane.dev/) は sorane リポジトリ内の `website/` を dogfooding してビルドしています。

### 404 ページ

ビルドは常に `dist/404.html` を出力します。Cloudflare Pages はこれを自動的にエラーページとして使います。

| 優先 | ソース | 結果 |
|------|--------|------|
| 1 | `content/404.md` | sorane でレンダリング |
| 2 | `static/404.html` | そのままコピー |
| 3 | なし | 言語に応じた既定ページ |

`404.md` はサイトマップ・ブログ一覧・OKF バンドル・検索インデックスから除外されます。

### D2 図表

`build.diagrams.d2.enabled: true` のサイトは CI で [d2](https://d2lang.com/) CLI をインストールしてください。sorane.dev は `v0.7.1` を使っています。

## 大規模サイト

記事やフォント資産が多いサイトは、コンテンツ用リポジトリを別にし、CI で `npx @sorane/cli` を pin してビルドします。

```yaml
- checkout コンテンツ repo
- npx @sorane/cli@0.2.7 index --cwd . --force
- npx @sorane/cli@0.2.7 build --cwd . --clean
- wrangler pages deploy dist --project-name <name>
```

sorane ソースを checkout する構成も可能です。`AGENTS.md` の `SORANE_ROOT` を参照してください。

### 検索・大容量資産

- **標準（FTS）**: モデル不要。`search-index.json` のみ dist に含まれる
- **experimental（hybrid）**: `search.mode: hybrid` + `bundle_model: false` で ONNX を R2 等から配信

## ドメイン構成

| ホスト | 用途 |
|--------|------|
| `sorane.dev` | プロダクトサイト |
| `ssg.sorane.dev` | ミラー |
| `sorane.pages.dev` | Pages 既定 URL |

`sorane.yaml` の `base_url` を本番ホストに揃えてください。

## アクセス解析・ログ（Cloudflare）

sorane は HTML にアナリティクス JS を埋め込みません。計測は Cloudflare ゾーン側で行います。

### Web Analytics（ページビュー等・推奨）

1. [設定](configuration.html#cloudflare-ホスティング) のとおり `site.hosting.cloudflare.web_analytics: true` を書く
2. `sorane build` で `dist/ops/cloudflare.json` を確認
3. Cloudflare ダッシュボードで対象ゾーンの **Web Analytics** を有効化

ダッシュボードで PV・参照元・デバイス等を確認できます。監査用の生ログは不要なサイトではここまでで十分です。

### Logpush（監査用アクセスログ・任意）

公的サイトなどで HTTP リクエストの生ログが必要なときだけ、ゾーン **Logpush**（`http_requests`）→ R2 を設定します。

1. `sorane.yaml` に `logpush` ブロックを追加
2. `templates/cloudflare/logpush/setup-r2.sh` でジョブ作成

詳細: [design/access-logs.md](https://github.com/masanork/sorane/blob/main/design/access-logs.md)