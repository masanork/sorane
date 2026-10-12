# Sorane の問い合わせ受付

Sorane が生成するフォーム、公開配信 Worker または Pages 用 Worker の受付 API、管理 Worker の受信箱を使います。kototoi の認証・スクリプト・API は不要です。受信箱での確認と対応状況の管理に加え、Pages 用 Worker は所有者への新着メール通知を提供します。通知は運用者が明示的に設定したサイトだけで有効になります。

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
node --test tests/contact-worker.test.ts tests/pages-contact-worker.test.ts tests/contact-notifications.test.ts tests/pages-publication.test.ts tests/ssg-worker.test.ts
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

手動で停止する場合は同じコマンドに `--disable` を追加し、停止 SQL を先に適用してからフォームを無効化・再デプロイします。この SQL 生成コマンド自体は Pages を監視しません。

`sorane.dev` と `ssg.sorane.dev` では、[本番設定](../deployment/production/README.md#pages-と受付設定の自動更新)の CI が Pages と公開記録を合わせて更新します。フォームを無効にした変更も、受付の停止を先に行ってから配信します。CI から過去のデプロイに戻す場合は、そのデプロイの監査記録にある受付設定を復元します。

## 所有者への新着通知

Pages 用 Worker の `send_email` バインディング `NOTIFY` と5分ごとの Cron を使います。
Cloudflare の [Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/) で
通知用の送信ドメインを有効にし、送信元を `allowed_sender_addresses` で制限してください。
通知先には所有者が指定したアドレスを使用し、Cloudflare で必要な宛先確認を済ませます。
既存のメール運用がある場合は、通知専用のサブドメインを使用すると認証レコードを分けられます。
入力内容の返信先には送りません。自動返信も行いません。

本番専用 D1 に `0007_contact_notifications.sql` を適用してから Worker を更新します。
通知先をコード、Pages、公開設定、CI ログに入れず、私有の通知ポリシーとして D1 に登録します。
次の JSON を Git 管理外のモード600のファイルに保存します。`ownerSub` は通常不要です。
所有者が複数いる場合だけ、通知を受け取る所有者の本番 RP の subject を私有ファイルに指定します。

```json
{"site":"my-site","from":"inquiries@notify.example.com","to":"owner@example.com","adminOrigin":"https://admin.example.com"}
```

```sh
umask 077
node packages/public-worker/scripts/contact-notification-policy.ts < /private/path/notification.json > /private/path/notification.sql
npx wrangler d1 execute YOUR-PRODUCTION-DB --remote --config YOUR-PRODUCTION-CONFIG --file /private/path/notification.sql
```

SQL 生成コマンドは Cloudflare に接続しません。対象サイトの所有者が存在しなければ、SQL の適用は失敗します。
通知を停止する場合は同じ私有 JSON に `"enabled": false` を追加して再適用してください。
通知先や設定を変更するとポリシーの世代が変わり、古い未送信通知は新しい宛先へ転送されません。
既存の問い合わせを遡って通知することもありません。

新しい問い合わせと未送信通知を同じ D1 トランザクションで保存し、受付後に
[`ctx.waitUntil`](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil) で送信します。
メールには新着の案内、受付番号、所有者のサインインが必要な受信箱のリンクだけを載せます。
送信者の名前・メールアドレス、問い合わせの件名・本文を含めません。
メールが送信できなくても受付番号は正常に返し、問い合わせを保存します。

通常のリクエスト再送では通知を増やしません。送信処理は D1 の180秒のリースで競合を抑え、
失敗時は60秒から最大1時間まで間隔を延ばし、最大8回まで試します。
Cron は5分ごとに10件ずつ処理します。所有者の権限を失った通知先、停止・変更した設定、
保存期限を過ぎた問い合わせには送信しません。失敗は固定のエラーコードだけを記録し、
例外メッセージや問い合わせ内容をログに出しません。送信成功はメールサービスの受付を意味します。
配信や迷惑メールへの振り分けは Email Sending の配信ログで確認してください。

メールサービスが受け付けた直後に Worker が停止すると、D1 に成功を記録できず、
リース期限後に同じ通知を再送する可能性があります。D1 とメールサービスに共通の
トランザクションはないため、この障害時の重複は完全には排除できません。
状態は私有の `contact_notification` テーブルに残り、問い合わせ削除時に一緒に消えます。
公開配信 Worker でこの通知ポリシーを使う場合も、同じ DB・サイト ID の通知処理 Worker と
Cron を用意してください。公開配信 Worker 単体はメール送信を実行しません。
