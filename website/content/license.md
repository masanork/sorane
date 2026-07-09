---
type: article
title: ライセンス
profile: sorane-okf/0.1
excludeFromList: true
---

空音プロジェクトのソースコードと、このサイト（[ssg.sorane.dev](https://ssg.sorane.dev)）に掲載するドキュメントは、いずれも **MIT License** です。コードと同じ条件で利用・改変・再配布できます。

サイト全体の宣言は `sorane.yaml` の `site.license` / `site.license_page` / `site.copyright` で機械可読に出力されます（全ページフッター、JSON-LD、`llms.txt`）。設定の詳細は [設定（YAML）](configuration.html#サイト全体のライセンス) を参照してください。

## ソフトウェア

npm パッケージ（`@sorane/cli` など）および [GitHub リポジトリ](https://github.com/masanork/sorane) のソースは、リポジトリ直下の [`LICENSE`](https://github.com/masanork/sorane/blob/main/LICENSE) に従います。

Copyright (c) 2023–2026 Masanori Kusunoki

## サイトのコンテンツ

本サイトの Markdown 由来のページ（ドキュメント、図表の説明文など）も **MIT License** とします。上記 `LICENSE` の文言がそのまま適用されます。

MIT License の全文は [Open Source Initiative](https://opensource.org/license/mit) でも参照できます。

## オープンデータについて

空音は `type: dataset` の frontmatter で **データセットごとのライセンス**（`license:`、SPDX 推奨）を宣言する仕組みを持ちます。これは **利用者が空音で公開するデータ**向けであり、空音本体や本ドキュメントの MIT とは別レイヤーです。官公庁データでは [公共データ利用規約](https://www.digital.go.jp/resources/open_data) など、データの性質に合ったライセンスを dataset に記載してください。詳細は [OKF プロファイル](okf-profile.html) と [Open Data Portal 連携](open-data-harvesting.html) を参照してください。