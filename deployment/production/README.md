# sorane.dev の問い合わせ環境

Pages プロジェクト `sorane` は `sorane.dev` と `ssg.sorane.dev` を配信します。
静的配信とは別に、次の本番専用 Worker と D1 を使用します。

| リソース | 対象 |
| --- | --- |
| 管理 Worker | `sorane-contact-admin` / https://admin.sorane.dev/ |
| 受付 Worker | `sorane-pages-contact` / 両公開ホストの `/_contact*` |
| D1 | `sorane-contact-production` / `3062dc10-ff03-4d94-b1f9-2cac0b274e80` / APAC |
| サイト ID | `sorane` |
| Mikaki client | `43620e1d-b026-4308-9a81-00e0ddf646e6` |
| RP origin | `https://admin.sorane.dev` |

本番 DB は開発用 `sorane-dev-admin` と共有しません。RP の issuer・client・origin は
D1 に固定されています。コード更新のために RP の再登録や初期化を行わないでください。
`admin.jsonc` の受信箱専用モードは管理者の役割を付与せず、記事の編集・公開を許可しません。
所有者登録と受付公開記録の有効化が必要です。方法は [問い合わせの手順](../../docs/native-contact.md)
と [所有者の初期登録](../../packages/admin-worker/README.md#connect-a-registered-mikaki-rp) を参照してください。

2026-10-10 の初期設定では、6件のマイグレーション、RP 登録、back-channel logout、
instance の identity pin、Worker の公開が完了しました。`/health` は 200、両公開ホストの
`/_contact` は GET/HEAD を 405 で拒否し、公開記録未設定の POST は 404 で拒否します。
2026-10-11 に、本番 RP への Passkey サインインを確認し、その認証済みアカウントを
サイト `sorane` の所有者として登録しました。開発 RP の pairwise subject を本番へ
コピーしていません。問い合わせフォームと WebMCP の `prepare_contact` を有効にし、
両公開ホストの Pages 配信確認後に、同じデプロイを受付公開記録へ登録しました。

2026-10-13 に本番の受信箱を Chrome で確認しました。Sorane からログアウト後、
既存の Mikaki セッションを使って再サインインし、所有者として確認用問い合わせを
閲覧できました。既存の動作確認データ1件を未対応から対応中・対応済みへ変更し、
再読み込みと再サインイン後も保存されること、対応済みの絞り込みに表示されることを
確認しました。実際の問い合わせには変更を加えていません。画面と確認記録は Git 管理外の
運用記録に保存しています。

初期公開時に確認した Worker バージョンは、管理 `3fa16057-1aa0-4db8-88e8-fe5ca1da5ad5`、
受付 `cd6ebd35-b9d0-47ac-ace3-a511bb36d9cc` です。669件のテスト、47件のブラウザー E2E、
型チェック、両本番設定のデプロイ検査に合格しています。`prepare_contact` は下書きの
入力までを行い、個人情報の取り扱いへの同意と送信は利用者が行います。

秘密鍵は管理 Worker の `RP_PRIVATE_JWK` Secret だけに配置します。ローカルの保護された
バックアップ・公開登録書・確認記録は、Git 管理外の `.sorane/operator/contact-production/` に
置きます。秘密鍵を受付 Worker、Pages、ブラウザー、GitHub CI に渡しません。

```sh
npm run workers:types
npm run workers:check
npx wrangler deploy --dry-run --config deployment/production/admin.jsonc
npx wrangler deploy --dry-run --config deployment/production/contact.jsonc
```

デプロイは同じ config を指定します。初回だけ管理 Worker に保護された `--secrets-file` を
指定し、通常のコード更新では既存 Secret を保持します。Pages の HTML を配信するだけでは
受付を有効化できません。公開中の Pages デプロイ ID・フォームの SHA-256・運用者・理由を
監査記録付きのポリシーに固定します。停止は API ポリシーを無効化してから HTML を更新します。

新着メール通知の送信元は `inquiries@notify.sorane.dev` です。Cloudflare Email Sending の
通知専用サブドメインを使用し、既存の `sorane.dev` のメール認証設定は維持します。
`0007_contact_notifications.sql` を適用し、通知先を私有の D1 ポリシーに設定すると、
以後の問い合わせを所有者へ通知できます。設定手順は [新着通知](../../docs/native-contact.md#所有者への新着通知)
を参照してください。通知先や本番 owner subject を Git、Pages、CI に保存しません。
両ホストの受付を同じポリシーで処理し、保存後の送信と5分ごとの再試行を受付 Worker が行います。
通知には受信箱のリンクと受付番号を載せ、問い合わせ本文・送信者情報は含めません。
自動返信は行いません。所有者が受信箱で確認し、必要な連絡を行います。
問い合わせ本文と返信先は公開ページ・検索・ビルド成果物に含めません。
通知処理のログは固定の失敗イベントだけを出力し、入力内容を扱うため invocation logs と traces は無効にします。

2026-10-13 に7件目のマイグレーションと通知用メールドメインを設定し、受付 Worker を
`3fddeafe-f92c-4df6-84ce-100799e23eb5` に更新しました。送信元を制限したメールバインディングと
5分ごとの Cron を本番で確認しています。707件のテスト、48件のブラウザー E2E、
Worker とリポジトリの型チェックに合格しました。通知先の有効化と実配信の結果は、
個人のメールアドレスを含まない Git 管理外の運用記録に保存します。

GitHub Actions の Cloudflare 認証を調べる場合は、`Cloudflare Pages auth diagnostics`
ワークフローを手動実行します。既存の `CLOUDFLARE_API_TOKEN` と
`CLOUDFLARE_ACCOUNT_ID` を使用し、token verify と Pages プロジェクト取得の GET だけを
行います。対象アカウントは `contact.jsonc` に固定された値と照合します。トークン値・
トークン ID・ハッシュ・API の生のレスポンスはログやサマリーへ出しません。
この診断は Pages の読み取り可否を確認するもので、デプロイや認証情報の更新は行いません。
通常の Pages デプロイも、依存パッケージのインストールとビルドの前に同じ診断を実行します。
認証に失敗した場合は HTTP ステータス・エラーコード・アカウント照合結果をサマリーに残し、
デプロイを開始しません。読み取りの成功だけでは Pages の書き込み権限を証明できないため、
公開の成功はその後の Wrangler と配信の確認で判断します。

## Pages と受付設定の自動更新

`Deploy docs site` ワークフローは `main` の Pages 更新と D1 の受付公開記録を
`scripts/deploy-pages.ts` で同期します。ビルドとテストが終わってから、両オリジンの受付を
監査記録付きで停止します。Pages の本番・ブランチ・コミットを確認し、デプロイ固有の URL と
両公開ホストの `contact.html` がビルドの SHA-256 に一致した後、同じトランザクションで
両オリジンを更新します。Cloudflare Analytics と、確認済みの JavaScript Detection の
追加スクリプトだけを除外して照合します。後者は ray ID と時刻を除いたスクリプト全体の
ハッシュを固定し、別のコードが追加された場合は除外しません。受付の有効化には、
D1 トランザクション内でも所有者の存在を確認します。
JavaScript Detection の HTML への挿入は [Cloudflare の仕様](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/#process)を参照してください。

公開の切り替え中はフォームの送信に短い停止時間があります。送信できなかった場合は入力を
保持し、再送できます。`site.contact.form.enabled: false` の変更では、Pages の更新より先に
受付を止め、配信確認後も停止を維持します。問い合わせページを取り除く変更にも対応します。
この環境のフォーム生成先は `contact.html`、受付先は `/_contact` に固定しています。

アップロード・配信確認・公開記録の更新が失敗した場合、この実行が公開した Pages だけを
直前のデプロイへ戻し、配信確認後に元の受付設定を新しい監査記録として復元します。
別の運用者が更新した Pages や公開記録は上書きしません。復旧中に所有者がいなくなった
場合は受付を再開しません。結果は Actions のサマリーに `phase`・`code`・`recovery` として
残します。`manual_review_required` の場合は、現在の Pages と D1 を確認してから復旧します。
自動復旧は Cloudflare API に接続できることが前提です。

CI トークンには対象アカウントの **Cloudflare Pages: Edit** と、この本番 DB の
**D1: Edit** が必要です。管理 Worker の RP 秘密鍵や所有者の subject は CI に渡しません。
CI の公開ジョブは同時に実行せず、後続の push で実行中の公開をキャンセルしません。

過去の成功した本番デプロイへ戻すときは、Actions の手動実行で `main` を選び、
`rollback_deployment` に対象 UUID を入力します。プレビューや、この本番 DB に受付設定の
監査記録がないデプロイは変更前に拒否します。フォーム停止済みのデプロイに戻す場合は
受付も停止し、有効だったデプロイへ戻す場合は所有者と配信を確認して再開します。

```sh
gh workflow run pages.yml --ref main -f rollback_deployment=PAGES-DEPLOYMENT-UUID
```

Cloudflare の画面から直接ロールバックした場合やジョブを強制キャンセルした場合は、
手動実行の `sync_current` を有効にして、公開中のデプロイの監査記録と配信を照合します。
これは Pages を再デプロイしません。未確認の新しいデプロイで中断して監査記録がない場合は、
`rollback_deployment` で確認済みのデプロイへ戻してください。

```sh
gh workflow run pages.yml --ref main -f sync_current=true
```

ローカルで公開する場合も、通常のビルド後に `node scripts/deploy-pages.ts` を使用します。
従来の `wrangler pages deploy` や Cloudflare の画面から行う変更は、この同期処理を通りません。
既存の公開記録が公開中の Pages とずれている場合、通常の公開は変更前に止まり、
上記の同期またはロールバックによる復旧を求めます。
