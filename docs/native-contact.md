# Sorane の問い合わせ受付

Sorane が生成するフォーム、公開配信 Worker または Pages 用 Worker の受付 API、管理 Worker の受信箱を使います。kototoi の認証・スクリプト・API は不要です。初期版は受信箱での確認と対応状況の管理を提供し、メール通知は行いません。

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
node --test tests/contact-worker.test.ts tests/pages-contact-worker.test.ts tests/ssg-worker.test.ts
npm run test:e2e -- tests/e2e/contact.spec.ts
npm run workers:check
npm run typecheck
```

Worker テストは実際の workerd・D1・R2 と署名付き OIDC のローカル環境を使用します。E2E は生成したフォームから両方の受付 API、所有者の受信箱、対応状況の更新までをブラウザーで確認します。自動テストは外部へのメール送信や本番への問い合わせを行いません。

## Pages で配信するサイト

Pages の静的配信は継続し、`packages/public-worker/src/pages-contact.ts` を `https://YOUR-SITE/_contact*` の Worker Route に配置します。[Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) は URL ごとに最も具体的な設定を適用するため、既存のサイト配信とこの API を別々に更新できます。

Pages 受付用の Worker と管理 Worker に同じ **本番専用** D1 をバインドし、`0006_pages_contact.sql` まで適用します。受付 Worker の `CONTACT_SITE_ID` に受信箱のサイト ID、`CONTACT_ORIGINS` に本番の HTTPS オリジンの JSON 配列を設定します。別名ホストも明示的に指定できます。プレビューホストは登録しません。管理 Worker を `ADMIN_MODE: inquiries` で起動すると、受信箱だけを表示し、記事編集・メンバー変更・ビルド・公開 API は使用できません。Queues、Artifacts、R2 の本番用リソースは不要です。

Mikaki RP は開発環境と別のオリジン・登録・秘密鍵を用い、実際にサインインした所有者を管理 Worker の手順で明示的に登録します。所有者を設定するまでは、受付を有効にできません。

フォームを含む Pages の本番デプロイが成功した後、実際のデプロイ UUID と公開 HTML のハッシュを記録します。次のコマンドは監査付きの有効化 SQL を出力するだけで、Cloudflare への接続や適用はしません。

```sh
node packages/public-worker/scripts/pages-contact-policy.ts \
  --site my-site --origin https://YOUR-SITE \
  --deployment PAGES-DEPLOYMENT-UUID --form website/dist/contact.html \
  --actor OPERATOR --reason 'Reviewed Pages contact deployment' > /tmp/contact-policy.sql
```

出力を確認し、対象の本番 D1 に `wrangler d1 execute --remote --file` で適用します。HTML は `action="/_contact"` の Sorane フォームでなければ拒否します。公開記録が有効なオリジンだけが受け付けられ、入力 Origin もその送信先と一致する必要があります。同じ制限・同意・重複受付・保存期限・所有者認証を使います。有効化後の公開記録変更も受付の D1 トランザクション内で再確認します。

停止する場合は同じコマンドに `--disable` を追加し、停止 SQL を先に適用してからフォームを無効化・再デプロイします。公開記録は Pages の自動更新を監視しません。ロールバックやフォーム設定の変更時は、運用者が公開記録も更新してください。実際の Sorane 環境は [本番設定](../deployment/production/README.md) を参照してください。
