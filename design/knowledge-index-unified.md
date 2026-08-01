# Unified knowledge index (OKFC-canonical)

| Field | Value |
|-------|-------|
| **Status** | **U0–U4 done** (foundation complete) |
| **Date** | 2026-08-02 |
| **Supersedes** | Ad-hoc dual pipeline: search `chunkDocument` vs OKFC `chunkMarkdownBody` |

---

## Principles

1. **Authoring source of truth:** Markdown + OKF frontmatter in `content/`.
2. **One intermediate IR:** concepts + chunks + optional embeddings.
3. **One prose chunker:** OKFC §5.3 (## / ###), mdast-based (fence-safe).
4. **Embed 0 or 1 times** into the IR; never a separate search-only embed path.
5. **OKFC is the canonical query container** for the site (`okf/site.okfc`).
6. **Web `search-index.json` is a projection** of the same chunks/vectors.
7. **FTS is always complete** without a model (`embeddings: off | auto | on`).

---

## Architecture

```text
content/**/*.md
    → OkfConcept[]
    → Knowledge IR
         concepts[], chunks[] (text_hash), vectors?[]
    → writers
         okf/site.okfc (+ units + registry)   [vec_chunks when embedded]
         assets/search-index.json  (browser)
    → consumers
         sorane okfc query / (future) sorane search → site.okfc
```

---

## Phases

| Phase | Goal | Done when |
|-------|------|-----------|
| **U0** | Shared prose chunker in `@sorane/okf`; search + OKFC call it | ✅ Same body+title → same chunk texts |
| **U1** | `buildKnowledgeIr` + `packOkfcFromIr`; site IR sliced per unit | ✅ `build` / CLI / Astro pack from IR |
| **U2** | `searchChunksFromKnowledgeIr` projection | ✅ API + tests |
| **U2.1** | Type-aware IR chunks; `buildSearchIndex` / `chunkDocument` via IR | ✅ faq/glossary/dataset/reference in `chunkConceptBody` |
| **U3** | `embeddings: auto` once into IR → OKFC vec + index | ✅ `embedKnowledgeIr`; `vec_chunks` on pack; index embeds via IR |
| **U4** | CLI search reads site.okfc | ✅ `sorane search` prefers `okf/site.okfc`; `--prefer-index` / `--okfc` |

---

## Document identity

Canonical concept id: **`{type}/{slug}`** (OKF / OKFC).

Search `source` (file path) remains for incremental rebuild keys.

---

## Embeddings policy

```yaml
build:
  knowledge:
    embeddings: off | auto | on   # default: auto
search:
  mode: fts | hybrid              # hybrid + auto → embed into IR at build
```

| Value | Behavior |
|-------|----------|
| `off` | FTS only; no `vec_chunks` |
| `auto` | Embed when `search.mode: hybrid` **and** model present; else FTS only |
| `on` | Model required or build fails |

`build.okfc.embeddings` can override the same enum for OKFC pack only (legacy `false` → `off`).

No mode where hybrid search has vectors and site.okfc does not for the same corpus (when both are built with the same policy).

---

## Code map

| Piece | Location |
|-------|----------|
| Shared prose chunker | `packages/okf/src/chunk-prose.ts` |
| Type-aware concept chunks | `packages/okf/src/chunk-concept.ts` |
| Knowledge IR | `packages/okf/src/knowledge-ir.ts` |
| Pack from IR (+ vec) | `packages/okf/src/okfc-pack.ts` |
| Embed IR | `packages/search/src/embed-ir.ts` (`embedKnowledgeIr`) |
| Config | `packages/core/src/knowledge-config.ts` |
| Build wire | `packages/core/src/build.ts` (one site IR → embed → unit slices) |
| Search projection | `packages/search/src/from-ir.ts` |
| Search index | `packages/search/src/build-index.ts` (IR embed path when hybrid) |
| CLI search | `packages/cli/src/search-cmd.ts` (`resolveSearchBackend`) |

### U4 behavior

| Flag / path | Backend |
|-------------|---------|
| `--okfc <path>` | Force that OKFC file |
| `{out_dir}/okf/site.okfc` exists | OKFC (default) |
| `--prefer-index` | `.sorane/index.db` (or `--index` / `--out`) |
| no site.okfc | index.db |

`sorane okfc query` remains the low-level OKFC tool. Hybrid vector query on OKFC is future work (`vec_chunks` already packed in U3).
