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
- npx @sorane/cli validate --cwd . --json
- npx @sorane/cli index --cwd . --force   # 検索ページがある場合
- npx @sorane/cli build --cwd . --clean
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
- npx @sorane/cli index --cwd . --force
- npx @sorane/cli build --cwd . --clean
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

### アクセス解析（無料プラン）

Cloudflare には名前が似た製品が2つあります。**ゾーンの HTTP Traffic で「Upgrade to Pro」が出るのは正常**です（詳細な PV / Visits は Pro 以上）。

| 製品 | 場所 | 無料 | PV 相当 | sorane HTML |
|------|------|------|---------|-------------|
| **Pages Web Analytics** | Workers & Pages → プロジェクト → **Metrics** → Enable | ○ | ○（Core Web Vitals 含む） | ビルド成果物に CF がスニペット注入（ソース Markdown には書かない） |
| **ゾーン HTTP Traffic** | ゾーン → Analytics & Logs → HTTP Traffic | 基本のみ | Pro 以上で Page views / Visits | エッジ集計（JS 不要） |

**sorane.dev のような Pages サイト（解析だけ欲しい・監査不要）:**

1. [設定](configuration.html#cloudflare-ホスティング) で `web_analytics: true`（運用メモ用）
2. **Workers & Pages → `sorane` → Metrics → Web Analytics を Enable**
3. 次回デプロイ後に計測開始（数分〜24時間でデータ表示）

ゾーンの HTTP Traffic 無料枠（Requests / Bandwidth / Unique visitors）だけでも足りる場合は、Pro に上げずにそちらを見ても構いません。

### Logpush（監査用アクセスログ・任意）

公的サイトなどで HTTP リクエストの生ログが必要なときだけ、ゾーン **Logpush**（`http_requests`）→ R2 を設定します。

1. `sorane.yaml` に `logpush` ブロックを追加
2. `templates/cloudflare/logpush/setup-r2.sh` でジョブ作成

詳細: [design/access-logs.md](https://github.com/masanork/sorane/blob/main/design/access-logs.md)