---
type: article
title: デプロイ
profile: sorane-okf/0.1
excludeFromList: true
---

## Cloudflare Pages（推奨）

本番例は [sorane 公式サイト](https://sorane.pages.dev/) です。リポジトリ内の `website/` を sorane 自身でビルドし、CI から `website/dist` をデプロイしています（dogfooding）。

```yaml
# .github/workflows/pages.yml（概要）
- checkout sorane
- npm ci
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
- sorane index --cwd . --force   # 検索を使う場合
- sorane build --cwd . --clean
- wrangler pages deploy dist --project-name <name>
```

### 検索・大容量資産

- **25 MiB 制限**: `search.bundle_model: false` にし、大きな ONNX モデルは R2 等から配信（`asset_base_url`）

## カスタムドメイン

Cloudflare Pages で `sorane.dev` を CNAME 設定すれば、schema の `$id` と揃えられます。