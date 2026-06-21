---
type: article
title: sorane.dev を手に入れてから — 最初の一日
description: ドメイン取得、公式サイト公開、v0.4.0 リリース、OKF 0.3 と製品ブログのはじまりまで。
profile: sorane-okf/0.2
timestamp: 2026-06-21T12:00:00+09:00
author: Masanori Kusunoki
digitalSourceType: trainedAlgorithmicMedia
aiDisclosureNote: 本文は生成 AI が会話とコミット履歴を基に起草した。事実関係と文体は著者が確認した。
aiSystems:
  - name: Grok
    provider: xAI
tags:
  - product
  - release
---

6 月 20 日夜、**sorane.dev** を本番 URL に据えた。それまで技術検証よりだった TypeScript 版 SSG を、npm で入れてビルドできる製品として公式サイトに載せる——その一点から、昨日から今日にかけて一気に動いた。

## 製品サイトを立ち上げた

まず手を付けたのは「ドキュメントだけの入り口」からの脱却だ。

- [sorane.dev](https://sorane.dev) を Cloudflare Pages に接続し、リポジトリ内の `website/` を dogfooding した
- ドキュメント向けのサイドバー・目次・ページャーを整備し、[機能](features.html) ページでプロダクトの全体像を説明した
- ヘッダー検索と [リリースと配布](releases.html)、[サプライチェーン](supply-chain.html) を追加し、「どう使うか」「どう配布しているか」まで一続きの導線にした

トップはいきなりマニュアル一覧ではなく、**製品の顔**として機能するようにし始めた。今日からはトップのニュース欄でこうした更新も追える（この記事が最初の一本だ）。

## v0.4.0 — 軽量とフルの住み分け

開発の山は **v0.4.0** のリリースにある。

- `preset: blog` … 小さなサイト向けの軽量出力（HTML + feed + sitemap）
- `preset: okf-site` … sorane.dev 相当の機械可読出力（`catalog.jsonld`、`llms.txt`、OKF bundle など）
- 検索は `@sorane/search` をオプション化し、コア CLI だけでもビルドできる形に整理した

「ブログだけ欲しい」と「行政・オープンデータ向けのフル OKF」が同じエンジンで選べるようになったのが、いちばん大きな製品上の変化だと思う。詳細は [リリースノート](releases.html) と [設定（YAML）](configuration.html#プリセット) に書いてある。

## OKF 0.3 とオープンデータまわり

並行して、OKF 0.3 の実装を進めた。

- `dataset` / `reference` / `glossary` / `faq` などのページ型と JSON-LD
- `catalog-dcat.jsonld` による DCAT-AP 出力（ポータル連携の足がかり）
- ディレクトリにページが複数あるときの `index` 自動生成
- EU `data-theme` コードの warning（未知コードだけ通知、自由タグは許容）

[data.europa.eu](https://data.europa.eu) や CKAN への載せ方は [Open Data Portal 連携](open-data-harvesting.html) にまとめた。日本の公共データポータルとの距離感や、メタデータだけを送るハーベストの話も、この数日で整理した。

## 図表・エクスポート・インポート

製品サイトの読みやすさのため、図表まわりにも手を入れた。

- Mermaid は sorane.dev では **client モード**（CI に Chromium 不要）
- D2 / Graphviz のビルド時 SVG、PDF 向けの図の事前レンダリング
- Pandoc 経由の docx / PDF エクスポート、WordPress やはてなダイアリーなどからの **import** アダプタの追加

いずれも「同じ Markdown から、人間向け・印刷向け・移行向けに出し分ける」ための足場だ。

## ライセンスとサイトの在り方

製品ドキュメントのライセンスをどう示すかも議論した。

- ソースは従来どおり **MIT**
- サイト全体も MIT とし、`site.license` でフッター・JSON-LD・`llms.txt` に反映する
- 著作権年は `copyright_since: 2023` とビルド年から自動で `2023–2026` のように表示する（リポジトリ初出に合わせた 2023 年）

オープンデータ利用者向けの `dataset` の `license:`（PDL や CC-BY など）とはレイヤーを分ける、という整理だ。[ライセンス](license.html) ページに書いてある。

## これから

sorane.dev 上に **プロダクトブログ** を置くことにした。別ドメインではなく、ドキュメントと同じサイトに載せる。バージョン告知や設計の背景はここに、手順や仕様はこれまでどおりドキュメントに——という住み分けだ。

次のリリースや大きな機能の話も、このニュース欄から続ける。`feed.xml` も更新対象になる。