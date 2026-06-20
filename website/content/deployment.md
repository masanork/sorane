---
type: article
title: デプロイ
profile: sorane-okf/0.1
excludeFromList: true
---

## Cloudflare Pages（推奨）

[soranork/blog](https://github.com/masanork/blog) が本番例です。コンテンツリポジトリと sorane を分離し、CI でビルドして `dist/` をデプロイします。

```yaml
# .github/workflows/deploy.yml（概要）
- checkout blog（コンテンツ）
- checkout sorane → npm ci
- sorane index --cwd . --force   # 検索を使う場合
- sorane build --cwd . --clean
- wrangler pages deploy dist --project-name <name>
```

### 注意点

- **25 MiB 制限**: `search.bundle_model: false` にし、大きな ONNX モデルは R2 等から配信（`asset_base_url`）
- **SPA フォールバック**: `/srn/` 配下のクライアントルーティング用。記事 URL は `*.html` 直リンク
- **シークレット**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

## sorane 公式サイト

sorane リポジトリ内の `website/` を sorane 自身でビルドし、`sorane.pages.dev` にデプロイします（dogfooding）。

## カスタムドメイン

Cloudflare Pages で `sorane.dev` を CNAME 設定すれば、schema の `$id` と揃えられます。