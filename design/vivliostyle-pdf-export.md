# Vivliostyle PDF export (sketch)

| Field | Value |
|-------|-------|
| **Date** | 2026-06-21 |
| **Status** | Sketch (PR6) |
| **Related** | `design/markup-interchange.md` |

---

## Overview

PDF export is a **sibling output** over the web build. sorane does not re-parse Markdown for PDF; it feeds **built HTML + CSS** from `dist/` to [Vivliostyle CLI](https://vivliostyle.org/).

```
sorane build  →  dist/*.html + assets
sorane export --format pdf  →  Vivliostyle CLI  →  *.pdf
```

This matches the markup interchange contract: HTML remains the web source of truth; docx uses Pandoc on mdast; PDF uses Vivliostyle on HTML.

---

## Prerequisites

1. Run `sorane build` so `config.build.out_dir` (default `dist/`) exists with page HTML.
2. Install Vivliostyle **one of**:
   - `npm i -g @vivliostyle/cli` (binary `vivliostyle` on PATH)
   - one-off via `npx @vivliostyle/cli` (sorane falls back automatically)
   - set `VIVLIOSTYLE` to a custom binary path

Vivliostyle is **not** a required npm dependency and is **out of default CI**.

---

## CLI

```bash
# Single page by content path (resolves out_rel like build)
sorane export --format pdf --cwd <site> --out article.pdf \
  --file article/2025-01-01-hello.md

# Single page by built HTML path (relative to out_dir)
sorane export --format pdf --cwd <site> --out article.pdf \
  --html 2025-01-01-hello.html

# Batch: every buildable page with a matching dist HTML
sorane export --format pdf --cwd <site> --out export-pdf/
```

| Flag | Meaning |
|------|---------|
| `--format pdf` | Vivliostyle export (required) |
| `--cwd` | Site root (`sorane.yaml`) |
| `--out` | Output `.pdf` file or directory |
| `--file` | Content-relative `.md` (mutually exclusive with `--html`) |
| `--html` | `out_dir`-relative `.html` |

Batch mode preserves locale/path structure under `--out` (e.g. `en/page.html` → `en/page.pdf`).

---

## Implementation

| Module | Role |
|--------|------|
| `packages/core/src/export/vivliostyle-cli.ts` | Binary resolution, `vivliostyle build` spawn |
| `packages/core/src/export/pdf.ts` | Map content → `outRel`, invoke CLI |
| `packages/cli/src/export.ts` | `--format pdf` wiring |

Vivliostyle runs with `cwd = dist/` so relative `./assets/main.css` links resolve like the static server.

---

## Known limitations (sketch)

- **Site chrome in PDF**: header search UI, nav scripts, and missing `search.mjs` (404 in headless build) may appear in output; acceptable for smoke tests.
- **No `print.css` yet**: future work can add `@media print` or a Vivliostyle-specific stylesheet under `static/`.
- **Interactive diagrams**: Mermaid/D2 client-rendered blocks may not match browser output without a pre-render pass.
- **404 / search-only pages**: batch export skips HTML files that are not buildable content pages.

---

## Verification (local)

```bash
npm run build -- --cwd examples/minimal --clean
sorane export --format pdf --cwd examples/minimal --out /tmp/hello.pdf \
  --file article/2025-01-01-hello.md
```

Tests in `tests/export-pdf.test.ts` skip when Vivliostyle is unavailable (same pattern as docx / Pandoc).