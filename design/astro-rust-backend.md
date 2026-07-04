# Astro integration and Rust backend boundary

Status: design note after `@sorane/astro` hardening (validation, route mapping, search, smoke test).

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
- backend selection interface with only `ts` implemented
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

Next:

1. Reach TS/CLI output parity (then enable CLI in `backend: "auto"` by default).
2. Expand Rust validation and bundle serialization to match `@sorane/okf`.
3. Add `backend: "wasm"` when a WASM artifact is published.
