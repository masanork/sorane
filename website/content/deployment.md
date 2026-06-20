---
type: article
title: デプロイ
profile: sorane-okf/0.1
excludeFromList: true
---

## Cloudflare Pages（推奨）

本番例は [sorane 公式サイト](https://sorane.dev/) です。リポジトリ内の `website/` を sorane 自身でビルドし、CI から `website/dist` をデプロイしています（dogfooding）。

```yaml
# .github/workflows/pages.yml（概要）
- checkout sorane
- npm ci
- sorane index --cwd website --force
- sorane build --cwd website --clean
- wrangler pages deploy website/dist --project-name sorane
```

初回のみ Cloudflare で Pages プロジェクト `sorane` を作成してください（`wrangler pages project create sorane`）。

### 注意点

- **シークレット**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`（リポジトリ Secrets）
- **テーマ CSS**: `website/` のようにサブディレクトリを cwd にする場合、親の `templates/default/` を自動参照します

## 大規模サイト（コンテンツ分離）

記事やフォント資産が多いサイトは、コンテンツ用リポジトリを別にし、CI で sorane を checkout してビルドする構成も取れます。

```yaml
# 概要
- checkout コンテンツ repo
- checkout sorane → npm ci
- sorane index --cwd . --force   # FTS 検索（標準）
- sorane build --cwd . --clean
- wrangler pages deploy dist --project-name <name>
```

### 検索・大容量資産

- **標準（FTS）**: モデル不要。`search-index.json` のみ dist に含まれる
- **experimental（hybrid）**: `search.mode: hybrid` + `bundle_model: false` で ONNX を R2 等から配信（Pages 25MiB 制限）

## カスタムドメイン

`sorane.dev` を Cloudflare Domains で取得済みです。Pages プロジェクト `sorane` にカスタムドメインを追加し、`sorane.yaml` の `base_url` を `https://sorane.dev` に揃えています（OKF schema の `$id` と一致）。

初回はダッシュボードの **Workers & Pages → sorane → Custom domains** で `sorane.dev` の DNS / SSL が `Active` になるまで数分かかることがあります。反映前は `sorane.pages.dev` でもアクセスできます。