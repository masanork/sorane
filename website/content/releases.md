---
type: article
title: リリースと配布
profile: sorane-okf/0.1
excludeFromList: true
---

## 現状（v0.1.0）

| 手段 | 状態 | 用途 |
|------|------|------|
| git clone + `npm ci` | **利用可能** | 開発・本番ビルド（公式サイト CI と同じ） |
| GitHub Release タグ | 計画中 | バージョン固定・フォント資産配布 |
| npm publish | 未対応 | `npx sorane` での手軽な利用 |
| Docker イメージ | 未対応 | CI / 再現性の高いビルド |

## 配布の形

**公式サイト（本番例）** — 単一リポジトリ:

```
masanork/sorane
├── packages/*   … CLI・ビルドエンジン
└── website/     … ドキュメント（sorane.dev）
```

**大規模サイト** — コンテンツとツールを分離する場合、CI で sorane の ref を pin します。

```yaml
- uses: actions/checkout@v4
  with:
    repository: masanork/sorane
    ref: v0.1.0        # タグで固定
    path: sorane
```

## ロードマップ

### Phase 1 — ドキュメントとタグ付けリリース

- [x] 公式サイト `sorane.dev`（`sorane.pages.dev` はフォールバック）
- [ ] `CHANGELOG.md` と SemVer タグ（`v0.1.0` …）
- [ ] GitHub Releases にソース tarball + Bunsen フォント資産

### Phase 2 — npm 配布

ネイティブ依存（`better-sqlite3`, `onnxruntime-node`）があるため、単純 publish には以下が必要です。

- TypeScript → JavaScript ビルド、または Node 23+ の TS 直実行を前提としたドキュメント
- optional dependencies の整理
- `@sorane/cli` として公開、`npx @sorane/cli build` を目標

### Phase 3 — エコシステム

- Astro テーマ層（sorane 出力の上に載せる）
- Homebrew formula / Docker image
- [x] `sorane.dev` カスタムドメイン