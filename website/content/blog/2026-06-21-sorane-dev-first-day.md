---
type: article
title: sorane.dev を手に入れてから — 最初の一日
description: ドメイン取得、公式サイト公開、v0.4.0 リリース、OKF 0.3 と製品ブログのはじまりまで。
profile: sorane-okf/0.1
timestamp: 2026-06-21T12:00:00+09:00
author: Masanori Kusunoki
tags:
  - product
  - release
---

6 月 20 日夜、**sorane.dev** を本番 URL に据えました。それまで社内検証寄りだった TypeScript 版 SSG を、npm で入れてビルドできる製品として公式サイトに載せる——その一点から、昨日から今日にかけて一気に動きました。

## 製品サイトを立ち上げた

まずやったのは「ドキュメントだけの入り口」からの脱却です。

- [sorane.dev](https://sorane.dev) を Cloudflare Pages に接続し、リポジトリ内の `website/` を dogfooding
- ドキュメント向けのサイドバー・目次・ページャーを整備し、[機能](features.html) ページでプロダクトの全体像を説明
- ヘッダー検索と [リリースと配布](releases.html)、[サプライチェーン](supply-chain.html) を追加し、「どう使うか」「どう配布しているか」まで一続きの導線に

トップはいきなりマニュアル一覧ではなく、**製品の顔** として機能するようにし始めました。今日からはトップのニュース欄でこうした更新も追えるようにします（この記事が最初の一本です）。

## v0.4.0 — 軽量とフルの住み分け

開発の山は **v0.4.0** のリリースです。

- `preset: blog` … 小さなサイト向けの軽量出力（HTML + feed + sitemap）
- `preset: okf-site` … sorane.dev 相当の機械可読出力（`catalog.jsonld`、`llms.txt`、OKF bundle など）
- 検索は `@sorane/search` をオプション化し、コア CLI だけでもビルドできる形に整理

「ブログだけ欲しい」と「行政・オープンデータ向けのフル OKF」が同じエンジンで選べるようになったのが、いちばん大きな製品上の変化だと思います。詳細は [リリースノート](releases.html) と [設定（YAML）](configuration.html#プリセット) を参照してください。

## OKF 0.3 とオープンデータまわり

並行して、OKF 0.3 の実装を進めました。

- `dataset` / `reference` / `glossary` / `faq` などのページ型と JSON-LD
- `catalog-dcat.jsonld` による DCAT-AP 出力（ポータル連携の足がかり）
- ディレクトリにページが複数あるときの `index` 自動生成
- EU `data-theme` コードの warning（未知コードだけ通知、自由タグは許容）

[data.europa.eu](https://data.europa.eu) や CKAN への載せ方は [Open Data Portal 連携](open-data-harvesting.html) にまとめています。日本の公共データポータルとの距離感や、メタデータだけを送るハーベストの話も、この数日で整理しました。

## 図表・エクスポート・インポート

製品サイトの読みやすさのため、図表まわりも手を入れています。

- Mermaid は sorane.dev では **client モード**（CI に Chromium 不要）
- D2 / Graphviz のビルド時 SVG、PDF 向けの図の事前レンダリング
- Pandoc 経由の docx / PDF エクスポート、WordPress やはてなダイアリーなどからの **import** アダプタの追加

いずれも「同じ Markdown から、人間向け・印刷向け・移行向けに出し分ける」ための足場です。

## ライセンスとサイトの在り方

製品ドキュメントのライセンスをどう示すかも議論しました。

- ソースは従来どおり **MIT**
- サイト全体も MIT とし、`site.license` でフッター・JSON-LD・`llms.txt` に反映
- 著作権年は `copyright_since: 2023` とビルド年から自動で `2023–2026` のように表示（リポジトリ初出に合わせた 2023 年）

オープンデータ利用者向けの `dataset` の `license:`（PDL や CC-BY など）とはレイヤーを分ける、という整理です。[ライセンス](license.html) ページに書いてあります。

## これから

sorane.dev 上に **プロダクトブログ** を置くことにしました。別ドメインではなく、ドキュメントと同じサイトに載せます。バージョン告知や設計の背景はここに、手順や仕様はこれまでどおりドキュメントに——という住み分けです。

次のリリースや大きな機能の話も、このニュース欄から続けます。フィード（`feed.xml`）も更新対象になるので、購読している方はそちらもどうぞ。