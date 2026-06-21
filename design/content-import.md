# Content import (external blog exports → OKF articles)

| Field | Value |
|-------|-------|
| **Date** | 2026-06-21 |
| **Status** | Draft (I3 complete) |
| **Related** | `migrate` (in-repo OKF frontmatter only), srn `src/ssg/migrate.ts`, gjs `src/shared/txtbin/encoding-detect.ts` |

---

## Overview

`sorane import` brings **legacy blog export files** into `content/` as OKF `article` pages. Unlike `sorane migrate`, it reads **external** formats (Movable Type, はてな Atom, WordPress WXR, …) and does not require pre-existing sorane markdown.

```
export file (bytes, any legacy encoding)
  → decode (gjs-derived detection + iconv-lite)
  → format adapter (MT, hatena, wordpress, …)
  → ImportEntry[]
  → conceptToOkfMarkdown
  → content/article/*.md
```

**OKF principle:** imported `.md` keeps source body notation (HTML in Phase 1). Build-time transforms (term links, ruby) apply on render only.

---

## Decode layer (I1)

Prior art: **gjs txtbin** (`~/repo/gjs/src/shared/txtbin/encoding-detect.ts`) — BOM detection, UTF-8 validation score, Shift_JIS heuristic, unit tests.

sorane extensions:

| Piece | Source |
|-------|--------|
| `detectEncoding`, `scoreUtf8`, `scoreShiftJIS` | Ported from gjs (MIT) |
| `scoreEucJp` | sorane addition (old Unix / JP blogs) |
| `parseXmlEncodingDeclaration` | XML/HTML `encoding="…"` before byte sniff |
| `decodeBytes` for Shift_JIS / EUC-JP | **iconv-lite** (Node CI reliable; gjs uses `TextDecoder` only) |
| `readImportFile` | `fs` → bytes → text + metadata |

Detection order when `--encoding auto` (default):

1. CLI `--encoding <name>` override
2. BOM
3. XML declaration (first ~512 bytes, ASCII-safe scan)
4. Byte heuristic: UTF-8 vs Shift_JIS vs EUC-JP scores
5. Fallback UTF-8 with low confidence

Import logs record `import_encoding` in `.sorane/import-manifest.json` per entry.

**Not in scope for I1:** gjs MJ/JIS *character substitution* tables (戸籍文字正規化) — separate future pass (I5+).

---

## Format adapters

| ID | Format | Detection | PR |
|----|--------|-----------|-----|
| `mt` | Movable Type export | `--------` + `TITLE:` / `BODY:` | **I2** |
| `hatena-diary` | はてなダイアリー Atom | Atom + hatena NS | **I3** |
| `wordpress` | WordPress WXR | `<rss` + `wp:` | I4 |
| `auto` | Sniff above | default | I2+ |

### ImportEntry (internal)

```typescript
interface ImportEntry {
  sourceId: string;
  title: string;
  timestamp: string;       // ISO 8601
  status: 'publish' | 'draft';
  categories?: string[];
  body: string;            // HTML or text (Phase 1: keep HTML)
}
```

### MT adapter (I2)

Ported from srn `src/ssg/migrate.ts` `importMT`:

- Split on `--------\n`, metadata `KEY: value`, sections `BODY:` / `EXTENDED BODY:`
- Skip non-`Publish` when `--skip-drafts` (default on)
- Output filename: `{YYYY-MM-DD}-{slug}.md` under `--out` (default `content/article`)

### はてなダイアリー Atom adapter (I3)

`packages/core/src/import/adapters/hatena-diary.ts` + `atom-parse.ts`:

- Split `<entry>…</entry>` fragments (namespace-tolerant, no XML dependency)
- Body priority: `hatena:formatted-content` → `content[@type=text/html]` → `hatena:syntax` → `content`
- Draft: `app:draft` yes/no; categories from `category@term`
- はてなブログ Atom export も同一アダプタで取り込み可（`Hatena::Blog` / `blog.hatena.ne.jp`）

---

## CLI

```bash
sorane import \
  --input ~/Downloads/blog.txt \
  --cwd <site> \
  [--format auto|mt|hatena-diary] \
  [--out content/article] \
  [--encoding auto|utf-8|shift_jis|euc-jp] \
  [--dry-run] \
  [--skip-drafts]
```

| Flag | Meaning |
|------|---------|
| `--input` | Export file path (required) |
| `--format` | Adapter id (`auto` sniffs) |
| `--out` | Directory under site root (relative) |
| `--encoding` | Override charset detection |
| `--dry-run` | List would-write paths only |
| `--skip-drafts` | Skip non-published MT entries (default) |

Manifest: `.sorane/import-manifest.json` — `{ version, entries: [{ sourceId, relPath, encoding, importedAt }] }`.

---

## Phased PR plan

| PR | Scope | Acceptance |
|----|-------|------------|
| **I1** | gjs port + EUC-JP + iconv-lite + tests | Shift_JIS / EUC-JP fixtures decode correctly |
| **I2** | MT adapter + `sorane import` + manifest | MT export → OKF articles; dry-run |
| **I3** | はてなダイアリー Atom + auto sniff | Atom fixture smoke ✅ |
| **I4** | WordPress WXR + `--fetch-images` sketch | — |
| **I5** | HTML normalize (hatena keyword links), optional gjs glyph maps | — |

Out of default CI (one-shot migration tool).

---

## Verification

```bash
npm run typecheck && npm test
sorane import --input tests/fixtures/import/sample-mt.txt --cwd examples/minimal --dry-run
sorane import --input tests/fixtures/import/sample-hatena-diary.atom.xml --cwd examples/minimal --dry-run
```

---

## References

- gjs: `src/shared/txtbin/encoding-detect.ts`, `tests/unit/encoding-detect.test.ts`
- srn: `src/ssg/migrate.ts` (`importMT`)
- sorane: `packages/core/src/migrate.ts` (in-repo only)