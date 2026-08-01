# OKFC multi-unit packing (FTS complete)

| Field | Value |
|-------|-------|
| **Status** | Implemented (Phase A′) |
| **Date** | 2026-08-01 |
| **Spec** | bunko `docs/okfc-spec.md` 0.1-draft |
| **Search** | FTS5 complete; **vectors via U3** (`build.knowledge.embeddings` + IR) |

---

## Goals

1. Pack Definition Profile OKFC with full FTS (concepts + chunks + sources + verified).
2. Emit **site-wide** and **content-unit** `.okfc` files for agent download.
3. Publish `okf/registry.json` (multi-bundle index, §7-inspired).
4. Keep vectors optional: no model required for CI or lite hosts.

## Non-goals (this phase)

- `vec_chunks` / hybrid RRF
- `struct_fields` / non-markdown `body_format`
- Instance Profile, MCP, did:web
- Lossless unpack CLI (follow-up)

## Config

See `website/content/configuration.md` → `build.okfc`.

Defaults when `build.outputs.okfc: true`:

- `site: true` → `okf/site.okfc`
- `auto_directories: true`, `min_entries: 2` → `okf/units/{dir-slug}.okfc`
- `registry: true` → `okf/registry.json`

## Code map

| Area | Path |
|------|------|
| Pack SQL / rows | `packages/okf/src/okfc.ts`, `okfc-pack.ts` |
| FTS query | `packages/okf/src/okfc-query.ts` |
| Registry JSON | `packages/okf/src/okfc-registry.ts` |
| Unit resolution | `packages/core/src/okfc-units.ts` |
| Config | `packages/core/src/okfc-config.ts` |
| Build wire | `packages/core/src/build.ts` |
| CLI | `packages/cli/src/okfc-cmd.ts` |

## Embeddings (U3)

```yaml
build:
  knowledge:
    embeddings: auto   # off | auto | on — see knowledge-index-unified.md
  okfc:
    embeddings: auto   # optional override for OKFC pack only
search:
  mode: hybrid         # auto embeds only when hybrid
```

Chunks carry `source_hash` / IR `text_hash` for re-embed cache keys.
