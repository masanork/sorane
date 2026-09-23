# OKFC multi-unit packing

| Field | Value |
|-------|-------|
| **Status** | Implemented (Phase A′) |
| **Date** | 2026-08-01 |
| **Spec** | bunko `docs/okfc-spec.md` 0.1-draft |
| **Search** | FTS5 |

---

## Goals

1. Pack Definition Profile OKFC with full FTS (concepts + chunks + sources + verified).
2. Emit **site-wide** and **content-unit** `.okfc` files for agent download.
3. Publish `okf/registry.json` (multi-bundle index, §7-inspired).
4. Keep packing independent of external models and runtimes.

## Non-goals (this phase)

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
