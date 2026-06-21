---
type: article
title: サプライチェーン
profile: sorane-okf/0.1
excludeFromList: true
---

sorane のタグ付きリリース（`v*`）には SLSA v1.0 Build-L3 provenance、SBOM、CBOM が含まれます。

## 部品表

| 種類 | 内容 | 取得 |
|------|------|------|
| CBOM | プロセス内で使うハッシュ（SHA-256） | [cbom.json](/cbom.json) |
| SBOM | npm 依存ツリー | [GitHub Release](https://github.com/masanork/sorane/releases/latest) の `sbom.json` |

CBOM は C2PA 署名を **外部 `c2patool`** に委譲する前提です。sorane 本体は署名鍵を持ちません。

## リリース成果物

`v*` タグの GitHub Release には次があります。

- `@sorane/*` の npm pack tarball ×5
- source tarball（`sorane-vX.Y.Z.tar.gz`）
- `cbom.json` / `sbom.json` と SHA-256 サイドカー
- `sorane-vX.Y.Z.intoto.jsonl`（SLSA provenance）

npm から入れる場合は CI で provenance 付き publish します。認証は次のいずれかです。

1. **npm Trusted Publisher** — 各 `@sorane/*` パッケージの Settings で GitHub Actions を登録（`masanork/sorane`、`release.yml`）
2. **GitHub secret `NPM_TOKEN`** — npm の Granular Access Token（Publish 権限）

```bash
npx @sorane/cli@0.2.7 validate --cwd . --json
```

## 検証手順

リポジトリの [release-verification.md](https://github.com/masanork/sorane/blob/main/docs/release-verification.md) に、`slsa-verifier` と `gh attestation verify` を使った手順があります。