# sorane セキュリティ改善レポート

| Field | Value |
|-------|-------|
| **Date** | 2026-06-21 |
| **Status** | Implemented |
| **Related** | 初回設計レビュー（ペンテスト視点） |

---

## 概要

2026-06-21 の設計レビューで洗い出した **18 件**の指摘について、sorane モノレポに修正を実装した。本ドキュメントは変更内容と検証方法をまとめる。

---

## 実装サマリー

| ID | 重大度 | 指摘 | 対応 | 主な変更 |
|----|--------|------|------|----------|
| S-01 | 高 | プロトコル相対 URL の通過 | 修正 | `packages/core/src/safe-url.ts` |
| S-02 | 高 | iframe/embed による埋め込み | 修正 | `sanitize-schema.ts`, `rehype-filter-embeds.ts`, gov プリセット |
| S-03 | 中 | 設定由来 URL の未検証 | 修正 | `emergency-banner.ts`, `redirects.ts` |
| S-04 | 中 | CSP 未デプロイ | 修正 | `security-headers.ts`, ビルド時 `_headers` 出力 |
| S-05 | 中 | Mermaid `innerHTML` | 修正 | SVG サニタイズ、`gov` で `mermaid.mode: build` |
| S-06 | 中 | import SSRF | 修正 | `fetch-url-guard.ts`, `fetch-images.ts` |
| S-07 | 中 | 検索インデックス全文公開 | 修正 | `search_snippet_only`（gov 既定 on） |
| S-08 | 中 | 任意バイナリパス | 修正 | `validate-config-security.ts`, gov で拒否 |
| S-09 | 中 | 未ピン依存 | 修正 | Vivliostyle 固定版、CI d2 直ダウンロード |
| S-10 | 低 | preview の LAN 露出 | 修正 | `127.0.0.1` バインド |
| S-11 | 低 | `span[style]` 許可 | 修正 | sanitize schema から削除 |
| S-12 | 低 | C2PA 検証スキップ | 修正 | `--no_signing_verify` 削除 + probe |
| S-13 | 低 | YAML DoS | 修正 | `sorane.yaml` 512KB 上限 |
| S-14 | 情報 | 自動 npm install | 修正 | `@sorane/*` 以外は拒否 |
| S-15 | 情報 | モデル改ざん | 修正 | `search.mjs` で ONNX SHA-256 検証 |

---

## 詳細

### S-01 / S-02: URL と HTML サニタイズ

- 共通モジュール `safe-url.ts` を追加。`//evil`・`javascript:`・`data:` を拒否。
- `pandoc-to-html.ts` は同モジュールを利用。
- 既定の sanitize schema は **embed なし**（`strict_html: true` 相当）。
- レガシー移行向けに `build.security.allow_embeds: true`（`strict_html: false` 必須）で iframe を許可するが、`rehype-filter-embeds` が **https のみ**に制限。
- `validate --json` にリンクスキーム検査を追加（gov では error）。

### S-03: リダイレクト・バナー

- `validateRedirectTarget` を `safe-url.ts` に統合。
- `build.security.redirect_same_origin: true`（gov 既定）で外部 URL リダイレクトを validate error。
- 緊急バナーの `href` はビルド時に検証し、危険 URL はリンクごと落とす。

### S-04: CSP / セキュリティヘッダ

- ビルド時に `dist/_headers` を生成（`build.security.emit_security_headers`、既定 on）。
- `templates/cloudflare/static/_headers` を同内容に更新。
- hybrid 検索時は `script-src` に `'wasm-unsafe-eval'` を追加。

### S-05: Mermaid

- クライアントローダーで SVG から `script` / `foreignObject` / イベント属性を除去。
- `preset: gov` は `mermaid.mode: build`（`<img src="*.svg">`）を既定化。

### S-06: import SSRF

- `fetch-url-guard.ts`: プライベート IP・localhost・メタデータ IP を拒否、リダイレクト上限・サイズ上限。
- `sorane import --fetch-images` が `guardedFetch` を使用。
- `sorane import --strict-html` で危険タグを除去。

### S-07: 検索インデックス

- `build.security.search_snippet_only: true` のとき `search-index.json` から `text` フィールドを省略（gov 既定）。
- ブラウザ検索は `snippet` のみ使用。

### S-08: 外部バイナリ

- gov では `d2` / `dot` / `mmdc` / `exiftool` / `c2patool` 以外のパスを `validate` error。

### S-09: サプライチェーン

- `@vivliostyle/cli@11.0.2` にピン留め。
- CI の d2 インストールを GitHub Release tarball 直取得に変更（`curl | sh` 廃止）。

### S-10〜S-15

- preview サーバーは `127.0.0.1` のみリッスン。
- C2PA 署名後に `probeC2paManifest` で検証。
- `sorane.yaml` は 512KB 超で拒否。
- 自動 install は `@sorane/*` スコープのみ。
- hybrid 検索は ONNX の SHA-256 をクライアントで検証。

---

## 設定リファレンス

```yaml
build:
  security:
    strict_html: true          # iframe/embed/object 禁止（既定）
    allow_embeds: false        # はてな移行等で true + strict_html: false
    search_snippet_only: false # gov では true
    redirect_same_origin: false
    allow_custom_binaries: true
    emit_security_headers: true
    csp_profile: standard      # gov では strict
    link_scheme_check: warn    # gov では error
```

`preset: gov` は上記のうち厳格側を既定適用する。

---

## 検証

```bash
npm run typecheck
npm test
npm run build -- --cwd examples/minimal --clean
```

セキュリティ専用テスト: `tests/security.test.ts`

---

## 残存リスク・運用上の注意

1. **レガシー HTML 移行**: `allow_embeds: true` では信頼できる https 埋め込みのみ許可。未知の WordPress エクスポートは `--strict-html` 推奨。
2. **CSP と hybrid 検索**: `'wasm-unsafe-eval'` は必要最小限。gov サイトで hybrid を使わない場合は FTS のみが最も厳格。
3. **C2PA**: 署名検証は `c2patool --info` による簡易 probe。本番では追加の手動検証を推奨。
4. **フォーク PR CI**: ワークフローで untrusted `sorane.yaml` をビルドする場合は、引き続き `workflow` 権限制限と fork ポリシーの見直しが必要。

---

## 変更ファイル一覧（主要）

| パス | 内容 |
|------|------|
| `packages/core/src/safe-url.ts` | URL 検証の単一ソース |
| `packages/core/src/fetch-url-guard.ts` | SSRF ガード |
| `packages/core/src/security-headers.ts` | CSP / ヘッダ生成 |
| `packages/core/src/validate-unsafe-links.ts` | validate リンク検査 |
| `packages/core/src/validate-config-security.ts` | sorane.yaml セキュリティ検査 |
| `packages/core/src/config.ts` | `build.security` 設定 |
| `packages/core/src/presets.ts` | gov プリセット強化 |
| `packages/core/src/build.ts` | `_headers` 出力、sanitize 伝播 |
| `packages/search/src/web-export.ts` | snippet-only インデックス |
| `tests/security.test.ts` | 回帰テスト |