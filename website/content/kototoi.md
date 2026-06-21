---
type: article
title: kototoi 問い合わせフォーム
profile: sorane-okf/0.1
excludeFromList: true
---

[sorane](https://ssg.sorane.dev) 静的サイトに [kototoi](https://github.com/masanork/kototoi)（Passkey 問い合わせ）を埋め込む手順と運用メモです。

## 構成

| ホスト | 役割 |
|--------|------|
| `ssg.sorane.dev`（Pages） | 静的 HTML・`kototoi-form.js` / `.css`（同一オリジン） |
| `ask.sorane.dev`（Worker） | API・管理 UI・D1 |

フォーム JS は sorane ビルド成果物に同梱し、API 呼び出しだけ `ask.sorane.dev` 向けになります（CORS + `credentials: 'include'`）。Passkey の `rpId` は親ドメイン `sorane.dev` です。

```
ssg.sorane.dev/contact  →  kototoi-form.js（同一オリジン）
                    →  fetch → ask.sorane.dev/api/...
```

## `sorane.yaml`

```yaml
site:
  base_url: https://ssg.sorane.dev
  contact:
    page: contact.html   # llms.txt・発見性メタ用

kototoi:
  endpoint: https://ask.sorane.dev
  site_id: "<kototoi 登録時の UUID>"
  form:
    title: お問い合わせ
    intro: ご質問は下記からお送りください。
    submit_label: 送信する
    fields:
      - id: name
        label: 氏名
        type: text
        required: true
        max_length: 200
      - id: subject
        label: 件名
        type: text
        required: false
        max_length: 200
        placeholder: 任意（一覧の表示名になります）
      - id: body
        label: お問い合わせ内容
        type: textarea
        required: true
        max_length: 8000
```

- `endpoint` / `site_id` … kototoi Worker 側でサイト登録した値（全テナント共通の `ask.sorane.dev` でよい）
- `form` … ビルド時に `dist/kototoi-form.json` へ書き出し、クライアントが読み込む
- `subject`（件名）… 任意。入力するとスレッド一覧の表示名になる。未入力時は日付ベースのラベル（氏名は使わない）
- `site.base_url` と `site_id` の組は kototoi の `allowed_origins` と一致させる

## コンテンツ

問い合わせページ（例: `content/contact.md`）にプレースホルダを置きます。

```markdown
---
title: お問い合わせ
type: article
---

Passkey で認証します。

<!-- kototoi-form -->
```

ビルド後スクリプトが `<!-- kototoi-form -->` を `<div id="kototoi-form" …>` に差し替え、`<head>` / `</body>` 直前に CSS・JS を注入します（Markdown 内の `<script>` はサニタイズで落ちるため）。

## ビルド・CI

sorane 単体の `build` のあと、次を実行します（sorane 公式 CI も同順）。

```bash
node website/scripts/emit-kototoi.mjs
node website/scripts/patch-contact.mjs
```

| スクリプト | 内容 |
|-----------|------|
| `emit-kototoi.mjs` | `kototoi-form.js` / `.css` を `dist/` へコピー、`kototoi-form.json` を `sorane.yaml` から生成 |
| `patch-contact.mjs` | `dist/contact.html` に埋め込みタグを注入 |

**クライアント資産の参照順**（`emit-kototoi.mjs`）:

1. 環境変数 `KOTOTOI_CLIENT_DIST`（ローカル開発向け）
2. 兄弟リポ `../../kototoi/packages/client/dist`
3. `website/static/kototoi-form.js`（CI・本番用に vendored）

CI では kototoi リポジトリが無いため、`website/static/` に JS/CSS をコミットしておきます。

### クライアントを更新するとき

```bash
# kototoi リポジトリで
npm run build:client

# sorane リポジトリで
cp ../kototoi/packages/client/dist/kototoi-form.{js,css} website/static/
git add website/static/kototoi-form.js website/static/kototoi-form.css
```

その後 sorane をビルド・デプロイしてください。

## フォーム定義の API 同期

`sorane.yaml` の `kototoi.form` を変更したら、kototoi Worker へ push します（`@kototoi/cli`）。

```bash
export KOTOTOI_API_URL=https://ask.sorane.dev
export KOTOTOI_SETUP_TOKEN="<operator token>"

node /path/to/kototoi/packages/cli/dist/bin.mjs site sync --cwd website
```

`sorane.yaml` の `kototoi.site_id` と `kototoi.form` が必須です。`site.base_url` から `allowed_origins` も更新されます。

静的ビルドだけではフォーム項目は変わりません。**YAML 変更 → `site sync` → sorane 再ビルド**の両方が必要です。

## 管理画面（初回・運用）

| 操作 | URL / 手順 |
|------|------------|
| 管理 UI | `https://ask.sorane.dev/admin/sites/<slug>` |
| 初回管理者登録 | 本番 HTML に setup token は埋め込まない。`SETUP_TOKEN` で招待リンクを発行 |

```bash
curl -X POST "$KOTOTOI_API_URL/api/v1/operator/sites/<site-id>/admin-invites" \
  -H "Authorization: Bearer $KOTOTOI_SETUP_TOKEN"
```

返却の `inviteUrl`（`/admin/invite/...`）を開き、Passkey を登録します。2人目以降は管理画面の「管理者を招待」から発行できます。

## ローカル結合テスト

| サービス | コマンド例 |
|----------|------------|
| kototoi API | `npm run dev`（`localhost:8787`） |
| sorane プレビュー | `npx @sorane/cli preview --cwd website` |

ローカル用 `kototoi.endpoint` / `site_id` / `rpId: localhost` は kototoi の dev サイト登録に合わせます。本番 `sorane.yaml` とは別ファイル（ブランチや上書き）で管理するのが安全です。

## 関連

- sorane 公式の実装: `website/sorane.yaml`・`website/scripts/`・[お問い合わせ](contact.html)
- kototoi 設計: [sorane-plugin.md](https://github.com/masanork/kototoi/blob/main/design/sorane-plugin.md)・[deployment-sorane-dev.md](https://github.com/masanork/kototoi/blob/main/design/deployment-sorane-dev.md)