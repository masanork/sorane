# sorane Astro minimal

Minimal Astro-shaped fixture for `@sorane/astro`.

This example keeps Astro responsible for rendering and uses sorane only for OKF
validation and agent-readable publishing artifacts:

- `catalog.jsonld`
- `llms.txt`
- `okf/bundle.tar.gz`
- `sitemap.xml` (optional via `outputs`)
- `assets/search-index.json` + `assets/search.mjs` (`outputs.search`; FTS by default in `astro.config.mjs`)

Run inside a real Astro project after installing Astro:

```bash
npm install astro @sorane/astro @sorane/search
npx astro build
```

The integration can later swap OKF parsing, validation, and bundle generation to
Rust/WASM or a Rust CLI without changing Astro routes.
