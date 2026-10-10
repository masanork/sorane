# Sorane の問い合わせ受付

Sorane が生成するフォーム、公開配信 Worker の受付 API、管理 Worker の受信箱を使います。kototoi の認証・スクリプト・API は不要です。初期版は受信箱での確認と対応状況の管理を提供し、メール通知は行いません。

## フォームを生成する

`content/contact.md` を作成し、`sorane.yaml` で明示的に有効にします。

```yaml
site:
  title: My site
  description: My site description
  lang: ja
  base_url: https://public.example.com/my-site/
  contact:
    page: contact.html
    form:
      enabled: true
      privacy_notice: 入力内容は問い合わせへの対応に使用し、受付から30日後に削除します。
```

指定したページの本文の後に、お名前（任意）、返信先メールアドレス、件名、本文、個人情報の取り扱いへの同意欄を追加します。フォームの生成先が存在しない場合や、設定が不正な場合はビルドに失敗します。受付先はサイトの同一オリジンの `my-site/_contact` です。

JavaScript が有効な場合は画面内に受付番号を表示します。通信に失敗しても入力を保持し、同じ送信 ID で再送すると受付が重複しません。JavaScript が無効な場合は通常の HTML フォームで送信できます。入力内容をブラウザーの永続ストレージや URL に保存しません。

CLI ビルドで検索・WebMCP を使っているサイトでは、`search.webmcp.contact: true` で既存の `prepare_contact` ツールを利用できます。ツールは表示中の入力欄に下書きを入れるだけで、同意欄のチェックや送信は利用者が行います。Workers の軽量ビルドでは検索・WebMCP は引き続き Linux ビルドプロファイルの対象です。

## API と受信箱

管理・公開配信 Worker は同じ D1 を使用し、`0005_contact.sql` を含む管理 Worker のマイグレーションを適用してください。環境の作成と Mikaki 認証の設定は [管理 Worker](../packages/admin-worker/README.md) と [SSG Worker](../packages/ssg-worker/README.md) の手順に従います。

SSG Worker のビルド成果物にはフォームを有効にしたページを manifest に記録します。公開配信 Worker は公開中の manifest のハッシュと受付設定を検証し、公開承認済みのサイトだけを受け付けます。候補のビルドやプレビュー表示だけでは受付を有効にしません。プレビューのフォームは送信できません。Cloudflare Pages に静的ファイルを置くだけでは受付 API は作成されません。

所有者は `/sites/my-site/inquiries` で受信内容を確認します。25件ずつ表示し、未対応・対応中・対応済みで絞り込めます。詳細画面から対応状況を変更できます。同時に変更された場合は古いバージョンの更新を拒否します。本文は HTML として解釈しません。

閲覧・更新には所有者権限と Mikaki の管理セッションの再確認が必要です。編集者・公開担当者・閲覧者には問い合わせを表示しません。更新には CSRF 検証も必要です。

受付データは30日を経過すると閲覧できなくなり、管理 Worker の定期処理で本文・送信者情報・対応履歴を削除します。受付は1サイトにつき1時間100件、同じ送信元につき1時間5件までです。生の IP アドレスは保存せず、時間ごとのランダムなソルトでハッシュ化した制限用の値を使用し、定期処理で破棄します。ボット用の隠し入力欄に値がある送信は保存しません。

API は JSON または URL エンコードしたフォームを受け付け、送信元 Origin、入力型・長さ、メールアドレス、同意、重複送信 ID を検証します。受付内容をビルド出力、公開 API、検索インデックス、アプリケーションログに含めません。

## 検証

```sh
node --test tests/contact-worker.test.ts tests/ssg-worker.test.ts
npm run test:e2e -- tests/e2e/contact.spec.ts
npm run workers:check
npm run typecheck
```

Worker テストは実際の workerd・D1・R2 と署名付き OIDC のローカル環境を使用します。E2E は生成したフォームから受付 API、所有者の受信箱、対応状況の更新までをブラウザーで確認します。外部へのメール送信や本番へのテスト問い合わせは行いません。
