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

1. Node JSON CLI (`packages/astro/src/cli-main.ts`) delegates to `runSoraneAstroTsBackend` — byte-identical to inline `ts`.
2. `outputs.dcatCatalog` / `openData.dcatCatalog` emit `catalog-dcat.jsonld`.
3. `tests/astro-backend-parity.test.ts` guards Node CLI ≡ TS output (`SORANE_ASTRO_BACKEND_NATIVE=0`).

Native Rust backend parity (done):

1. `rust/sorane-astro-backend` — JSON contract CLI for `catalog.jsonld`, `llms.txt`, `okf/bundle.tar.gz`, `catalog-dcat.jsonld`, `sitemap.xml`.
2. `backend: "auto"` prefers native Rust when `cargo build` has produced the binary; falls back to Node CLI, then inline `ts`.
3. `SORANE_ASTRO_BACKEND_NATIVE=0` forces Node CLI (parity tests); `SORANE_ASTRO_BACKEND_CLI` overrides the binary path.
4. `tests/astro-backend-native-parity.test.ts` guards native ≡ TS for core artifacts (bundle compared after gunzip).
5. Native validation Phase A: OKF JSON Schema (3 profiles), heading, content-quality (image alt, link text, table headers, dates), disclosure fields. Diagram alt matches TS default (`diagrams.enabled: false` → no warnings). Directory index / i18n / FAQ / glossary remain TS-only.

Integration-layer validation (done):

1. `emitSoraneAstroArtifacts` always runs `validateSiteContent` via TypeScript before artifact backends; backends receive `validate: false` to avoid duplicate gates. Native/TS artifact backends stay interchangeable without weakening `validate: "error"`.

Next:

1. Expand native Rust validation toward full `validateSiteContent` parity (directory index, FAQ, glossary, i18n, …).
2. Move `outputs.search` indexing into the backend contract or a Rust helper.
3. Add `backend: "wasm"` when a WASM artifact is published.
