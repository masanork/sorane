---
type: article
title: 空音の大規模リファクタリング
description: Python 版空音を TypeScript と bun で書き直した再実装の記録。
profile: sorane-okf/0.2
timestamp: 2025-12-23T00:00:00Z
author: Masanori Kusunoki
tags:
  - product
---

金曜夜からの数日で空音の再実装を行った。土日は鳥取旅行だったので、せいぜい移動中のスキマ時間で大した手間はかけていないけれども、Python でつくったコードを全面的に TypeScript で書き直して、デフォルトのランタイムは最近 Anthropic が買収した bun を使ってみることにした。2 年前に Python でつくった空音は純粋に僕自身のための Static Site Generator で、star がゼロという泡沫プロジェクトだったが、今回のは誰かしらユーザーがつけばいいなと期待している。GitHub Pages でホストすることを想定しているが、特に凝ったことはしていないので Cloudflare なんかでも問題なく動くだろう。