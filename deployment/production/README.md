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
両公開ホストの Pages 配信確認後に、同じデプロイを受付公開記録へ登録します。

最終確認した Worker バージョンは、管理 `3fa16057-1aa0-4db8-88e8-fe5ca1da5ad5`、
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

問い合わせのメール通知・自動返信はありません。所有者が受信箱を確認し、必要な連絡を
行います。問い合わせ本文と返信先は公開ページ・検索・ビルド成果物に含めません。
