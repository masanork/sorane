---
type: article
title: リリースと配布
profile: sorane-okf/0.1
excludeFromList: true
---

## 現状（v0.2.0）

| 手段 | 状態 | 用途 |
|------|------|------|
| `npx @sorane/cli` | **利用可能** | サイトビルド・検索インデックス（Node.js >= 23.6） |
| git clone + `npm ci` | **利用可能** | 開発・本番ビルド（公式サイト CI と同じ） |
| GitHub Release タグ | **v0.2.0** | バージョン固定（`CHANGELOG.md` 参照） |
| npm ワークスペース | **公開済み** | `@sorane/cli`, `@sorane/core`, `@sorane/okf`, `@sorane/search`, `@sorane/font` |
| Docker イメージ | 未対応 | CI / 再現性の高いビルド |

### npm で使う

```bash
npx @sorane/cli@0.2.4 build --cwd ./my-site --clean
npx @sorane/cli validate --cwd ./my-site
```

パッケージ一覧: https://www.npmjs.com/org/sorane

### v0.2.0 の主な変更

- `sorane-okf/0.2` プロファイル（AI コンテンツ開示）
- 静的画像の IPTC XMP / C2PA（`asset-provenance.yaml`）
- Markdown インライン画像の provenance 伝播
- `BlogPosting` JSON-LD `associatedMedia`
- `sorane watch`、静的 `404.html`、OG メタ、a11y 改善

詳細はリポジトリの `CHANGELOG.md` を参照してください。

## 配布の形

**公式サイト（本番例）** — 単一リポジトリ:

```
masanork/sorane
├── packages/*   … CLI・ビルドエンジン
└── website/     … プロダクトサイト（sorane.dev）
```

**大規模サイト** — コンテンツとツールを分離する場合、npm または Git タグで sorane を pin します。

```yaml
# npm（推奨）
- run: npx @sorane/cli@0.2.4 build --cwd . --clean

# git checkout（開発・フォーク向け）
- uses: actions/checkout@v4
  with:
    repository: masanork/sorane
    ref: v0.2.0
    path: sorane
```

## ロードマップ

### Phase 1 — ドキュメントとタグ付けリリース

- [x] プロダクトサイト `sorane.dev`（`ssg.sorane.dev` はミラー、`sorane.pages.dev` はフォールバック）
- [x] `CHANGELOG.md` と SemVer タグ（`v0.1.0`, `v0.2.0`）
- [ ] GitHub Releases にソース tarball + Bunsen フォント資産

### Phase 2 — npm 配布

- [x] Node 23+ の TypeScript 直実行を前提とした公開
- [x] `@sorane/cli` として公開（`npx @sorane/cli build`）
- [ ] optional dependencies の整理（ハイブリッド検索向け）

### Phase 3 — エコシステム

- Astro テーマ層（sorane 出力の上に載せる）
- Homebrew formula / Docker image
- [x] `sorane.dev`（プロダクトサイト）
- [x] `ssg.sorane.dev`（ミラー）