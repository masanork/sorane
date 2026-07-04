# Astro integration and Rust backend boundary

Status: design note after native `sorane-astro-backend` parity (catalog, llms, bundle, DCAT, basic validation).

## Positioning

Astro owns page rendering, routing, component islands, and the Vite/Rolldown
pipeline. sorane owns OKF semantics and machine-readable publishing artifacts.

The integration boundary should stay file-based:

1. Read Astro content files (`src/content/**/*.md(x)`).
2. Parse frontmatter and body into an OKF document model.
3. Validate OKF profiles and site policy.
4. Emit artifacts into Astro's output directory.

This keeps sorane complementary to Astro instead of competing with Astro's Rust
renderer.

## Rust candidates

Good first Rust targets:

- OKF frontmatter extraction and YAML parsing
- profile/type validation
- OKF bundle entry generation
- deterministic tar/gzip bundle creation
- search chunk metadata extraction

Defer these until the boundary is stable:

- full Markdown rendering
- Astro route discovery
- HTML post-processing
- C2PA/IPTC external tool orchestration

## Runtime shape

Preferred order:

1. TypeScript integration calls pure TypeScript functions.
2. TypeScript integration can call a Rust CLI when configured.
3. TypeScript integration can use WASM for no-install local builds.

The public Astro integration should not expose which backend is active. A future
option can be:

```ts
soraneAstro({
  site: { title: "Site", description: "Desc" },
  backend: "auto", // auto | ts | wasm | cli
});
```

`auto` should prefer a native backend only when it is installed and compatible,
then fall back to TypeScript.

## Stable contract

Input JSON shape:

```json
{
  "root": "/repo/site",
  "contentDir": "/repo/site/src/content",
  "outDir": "/repo/site/dist",
  "site": {
    "title": "Site",
    "description": "Desc",
    "baseUrl": "https://example.dev"
  },
  "files": [
    {
      "relPath": "posts/hello.md",
      "source": "---\ntype: article\n..."
    }
  ]
}
```

Output JSON shape:

```json
{
  "concepts": 1,
  "validationErrors": 0,
  "validationWarnings": 0,
  "artifacts": [
    {
      "path": "catalog.jsonld",
      "kind": "text",
      "content": "{...}"
    },
    {
      "path": "okf/bundle.tar.gz",
      "kind": "base64",
      "content": "H4sI..."
    }
  ]
}
```

The TypeScript integration remains responsible for writing files, logging, and
Astro hook compatibility. The backend remains responsible for deterministic OKF
semantics.

## Next implementation step

Hardening checklist (done):

- real Astro fixture smoke test
- `validateSiteContent` parity for quality gates
- content collection route mapping tests
- backend selection interface (`auto` | `ts` | `cli` | `wasm`)
- optional search assets (`outputs.search`)
- CI job for Astro unit + smoke tests

JSON backend contract (done in TypeScript):

- `packages/astro/src/contract.ts` — input/output types + `schema_version`
- `packages/astro/src/backend-ts.ts` — `runSoraneAstroTsBackend(input)`
- `packages/astro/src/collect-input.ts` / `write-artifacts.ts` — disk I/O boundary
- `tests/astro-backend-contract.test.ts` — round-trip + artifact decode

Route loader + MDX gates + Rust CLI scaffold (done):

1. `packages/astro/src/route-loader.ts` — `getCollection()` static route discovery
2. `validate-site.ts` — `.mdx` included in quality gates
3. `rust/sorane-astro-backend` — JSON contract CLI (`backend: "cli"`)

TS/CLI parity + DCAT (done):

1. `outputs.dcatCatalog` / `openData.dcatCatalog` emit `catalog-dcat.jsonld`.
2. `bin/sorane-astro-backend.mjs` (npm) runs inline TypeScript for external subprocess use.

Native Rust backend parity (done):

1. `rust/sorane-astro-backend` — JSON contract CLI for `catalog.jsonld`, `llms.txt`, `okf/bundle.tar.gz`, `catalog-dcat.jsonld`, `sitemap.xml`.
2. `backend: "auto"` prefers native Rust when `cargo build` has produced the binary; falls back to inline `ts`.
3. `SORANE_ASTRO_BACKEND_NATIVE=0` disables native in `runSoraneAstroCliBackend`; `SORANE_ASTRO_BACKEND_CLI` overrides the binary path.
4. `tests/astro-backend-native-parity.test.ts` guards native ≡ TS for core artifacts (bundle compared after gunzip).
5. Native validation Phase A: OKF JSON Schema (3 profiles), heading, content-quality (image alt, link text, table headers, dates), disclosure fields. Diagram alt matches TS default (`diagrams.enabled: false` → no warnings).
6. Native validation Phase B: FAQ / glossary / glossary-term structure gates, directory index auto-listing hints (no i18n locale prefixes in Astro contract yet).
7. Native validation Phase C: reference / dataset warnings, lang mixing, glossary term-link index, revision history, redirect frontmatter (same-origin via `site.baseUrl`), unsafe link scheme checks, translation_key without i18n. `site.lang` added to backend contract (default `ja`). DCAT helpers stay in `open_data.rs`; dataset validation lives in `open_data_validate.rs`.
8. Native validation Phase D: `diagrams.enabled` alt gates, `build.redirects` config rules + collision detection, full `site.i18n` / `translation_key` cross-locale warnings. Backend contract adds `diagrams`, `redirects`, `security.redirectSameOrigin`, `site.i18n.locales[].pathPrefix`.

Integration-layer validation (done):

1. `emitSoraneAstroArtifacts` always runs `validateSiteContent` via TypeScript before artifact backends; backends receive `validate: false` to avoid duplicate gates. Native/TS artifact backends stay interchangeable without weakening `validate: "error"`.

Search + config security (done):

1. `outputs.search` + `search` config on the backend contract; TypeScript backend emits `assets/search-index.json` as an artifact (`search-backend.ts`). Companion assets (`search.mjs`, hybrid runtime) are written after artifact flush.
2. `validateConfigSecurity` parity: emergency banner href checks, custom-binary rejection when `security.allowCustomBinaries: false`.
3. `backend-artifacts.ts` extracts OKF artifact builders from `backend-ts.ts`; `@sorane/astro-backend-wasm` ships the Rust backend for `backend: "wasm"`.
4. Native Rust `outputs.search`: FTS + hybrid `assets/search-index.json` via `search.rs` / `search_chunker.rs` / `search_store.rs` / `search_ruri.rs` (SQLite incremental index at `.sorane/index.db`). Hybrid embeddings use pure-Rust ONNX (`ort` + `tokenizers`, ruri-v3-30m) when `onnx/model_quantized.onnx` and `tokenizer.json` exist; missing model → FTS-only fallback (parity with TypeScript).

WASM backend (done):

1. `@sorane/astro-backend-wasm` — wasm-pack Node.js artifact (`run_sorane_astro_backend`); build via `npm run build:astro-backend-wasm`.
2. `backend: "wasm"` and `auto` (after native CLI) call the WASM module; TypeScript remains the final fallback.

Hybrid search (done):

1. Native CLI: SQLite incremental index + hybrid JSON export (schema v3). Embeddings via pure-Rust ONNX (`search_ruri.rs`); parity-tested against `@sorane/search` reference vectors.
2. TypeScript backend / `sorane index` CLI: hybrid still uses `@sorane/search` (`@huggingface/transformers` + ONNX runtime).
3. WASM target: FTS-only direct JSON (no SQLite / ort on wasm32).

### Hybrid embedding SLA (native vs TypeScript)

Native Rust ONNX and `@sorane/search` (transformers.js) are **not required to be bit-identical** on every chunk. Short probe strings can match exactly; longer chunks may differ slightly between runtimes.

Accepted parity for CI and releases:

- **Structural:** `mode`, `chunks[]`, `model` metadata, and `embeddings` shape (`dim`, `encoding`, `scale`) must match between native and TypeScript backends.
- **Semantic:** decoded int8 vectors must have **cosine similarity ≥ 0.95** per chunk (`HYBRID_MIN_COSINE` in `tests/astro-backend-native-parity.test.ts`).

Tightening to bit-identical hybrid JSON is a future optimization (3D mean-pooling / ONNX output alignment), not a blocker for native-default Astro builds.

## TypeScript backend retention

The inline TypeScript artifact backend remains supported. Do not remove it until all of the following are true:

1. ~~`sorane index` can use native embeddings~~ (done when CLI is built; TS path remains fallback).
2. WASM hybrid or a documented WASM limitation is accepted in docs/CI.
3. Integration-layer validation policy is fixed (TS-only vs native).

Current shrink steps (in progress):

1. ~~Remove dead Node `embed-batch.mjs` bridge~~ (removed; native uses `search_ruri.rs`).
2. CI job `astro-ts-fallback` runs `tests/astro-backend-ts-fallback.test.ts` **without** `cargo build` to guard `backend: "ts"` and `SORANE_ASTRO_BACKEND_NATIVE=0` resolution.
3. Hybrid SLA documented above (≥ 0.95 cosine); native parity tests enforce it.
4. ~~`sorane index` via native CLI~~ — `sorane-astro-backend index` JSON subcommand; `packages/cli/src/index-cmd.ts` prefers native when built (`SORANE_INDEX_NATIVE=0` opts out).

### Native `sorane index` contract

```bash
cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml
echo '{"schema_version":1,"root":"/site","contentDir":"/site/content","indexPath":"/site/.sorane/index.db","force":true,"hybrid":true,"modelRoot":"vendor/models","modelId":"ruri-v3-30m"}' \
  | sorane-astro-backend index
```

Stdout: `{ schema_version, added, changed, removed, unchanged, chunks, fts, vec, mode, modelMissing }`.
