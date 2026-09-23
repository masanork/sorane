# Trust boundaries & export matrix

| Field | Value |
|-------|-------|
| **Status** | Active (P0 principles; G1/G2 draft publish gate implemented) |
| **Date** | 2026-08-03 |
| **Updated** | 2026-08-03 — production excludes `draft: true` from OKF bundle + search index |
| **Related** | [markup-interchange.md](./markup-interchange.md), [okf-v0.2-trust.md](./okf-v0.2-trust.md), [findability-pack.md](./findability-pack.md), [security-remediation-report.md](./security-remediation-report.md), [quality-gates.md](./quality-gates.md) |
| **Prior art** | Tsumugu “Content does not execute”, Semantic AST → machine exports, `hidden` existence vs recommendation |

---

## Motivation

Tsumugu and 空音 (sorane) both target **AI-era documentation**: humans and agents should read the same source of meaning, without treating author content as executable code.

Sorane already has:

- Markdown + OKF frontmatter as source
- Sanitization, CSP, `gov` preset, AI disclosure
- Machine outputs (`llms.txt`, `catalog.jsonld`, OKF bundle, OKFC, search)
- Agent contract (`validate --json`, `AGENTS.md`)

What was missing as **product principles**:

1. A one-sentence trust model (who is trusted for what)
2. Explicit invariants: machine-readable outputs are not scraped from HTML
3. A single **export matrix** for “existence” vs “recommendation” flags

This document fixes those as design truth, measures **current** code behavior (2026-08-03), and lists follow-ups.

---

## P0-1: Trust boundaries

### Slogan

> **Content does not execute.**  
> Authors may write prose and declarative frontmatter.  
> Only the Operator (who runs the build) trusts configuration, dependencies, and explicit opt-ins.

### Three parties

| Who | Trust | May do | Must not assume |
|-----|--------|--------|-----------------|
| **Operator** | Full (on their machine) | Run CLI, set `sorane.yaml`, install deps, choose preset / security flags, deploy `dist/` | That content authors are Code Owners |
| **Author** (human or AI editing `content/`) | Prose + frontmatter only | Edit Markdown, OKF metadata, diagrams as **data** | That raw HTML, scripts, or MDX-like code will run |
| **Reader / network** | Nothing | Fetch static files from the host | That client JS beyond what the build emitted is allowed |

### How sorane implements the boundary today

| Layer | Behavior | Code / config |
|-------|----------|---------------|
| Body HTML | Markdown → mdast → Pandoc AST → HTML; **rehype-sanitize** strips scripts; embeds opt-in | `markup/render-mdast.ts`, `sanitize-schema.ts` |
| Diagrams | Source stays in Markdown fences; client Mermaid is optional and sanitized; `gov` prefers build-time SVG | `build.diagrams`, security report S-05 |
| Headers | Build emits `dist/_headers` CSP (`default-src 'self'`, no arbitrary third-party scripts in `strict`) | `security-headers.ts` |
| AI disclosure | Frontmatter `generated` / `verified` / `digitalSourceType` — **attribution**, not execution | `sorane-okf/0.2+`, design/ai-content-disclosure |
| Operator opt-in | `allow_embeds`, non-strict HTML, client Mermaid | `build.security`, `build.diagrams.mermaid.mode` |

### Non-goals (this doc)

- Full MDX runtime (out of scope)
- Hash-only CSP (`script-src` pin by SHA) — possible later experiment; conflicts with analytics
- Replacing Mermaid with an in-tree subset renderer

### Invariant (normative)

1. Author-controlled body content **must not** become executable JavaScript in published HTML unless the Operator explicitly enables a documented opt-in.
2. `trust: true` (or similar) **must never** be settable from content frontmatter alone — only Operator config / CLI.

---

## P0-2: Machine-readable output invariants

Aligned with markup-interchange and Tsumugu’s “export from Semantic AST, not HTML”.

### Invariants (normative)

| ID | Rule |
|----|------|
| **M1** | Machine-readable site artifacts are built from **parsed concepts / IR / build graph**, not by scraping rendered HTML. |
| **M2** | Changing theme CSS or layout templates **must not** change the semantic payload of `catalog.jsonld`, OKF `.md` alternates, OKF bundle, OKFC, or search chunks (presentation-only diffs allowed in HTML). |
| **M3** | Diagram **source** remains in Markdown (fences); HTML is presentation. Search / OKF / agents can still read the fence text. |
| **M4** | Sibling `.md` alternates and `okf/bundle.tar.gz` preserve **source notation** (ruby, term links). |
| **M5** | `llms.txt` is a **recommendation / orientation** guide (links to catalogs and policies), not a full page inventory. Full inventory lives in catalog / OKF / (future) list JSON. |

### Current pipeline (summary)

```
content/**/*.md
  → extract + normalizeConcept (OKF)
  → mdast → Pandoc AST → HTML          (human pages)
  → concept + IR                       (catalog, OKFC, search chunks)
  → build graph (siteEntries, lists)   (sitemap, feed, blog nav)
```

See [markup-interchange.md](./markup-interchange.md) for the body hub; this doc owns **site-level export policy**.

---

## P0-3: Existence vs recommendation

### Vocabulary

| Intent | Meaning | Typical surfaces |
|--------|---------|------------------|
| **Existence** | “This concept exists in the project / site corpus” | OKF bundle, catalog (honest inventory), optional future `documents.json` / `sorane list --json` |
| **Recommendation** | “Please read / crawl / index this for discovery” | `llms.txt` links, `sitemap.xml`, Atom feed, blog lists, search index (browser) |
| **Access control** | Not provided by these flags | Hosting ACLs; `hidden`-style flags are **not** auth |

Tsumugu insight: `hidden` stays in the inventory with a flag, but leaves recommendation surfaces. Sorane should make the same distinction explicit even if flag names differ.

### Flags and settings (current)

| Control | Where | Intended meaning (product) |
|---------|--------|----------------------------|
| `draft: true` | page frontmatter | Not published; only with `sorane build --drafts` / `preview` |
| `excludeFromList: true` | page frontmatter | Omit from **blog-style lists** (index, archive, tags, article nav, feed) |
| `isSystem: true` | page frontmatter | System page; not normal content listing |
| `view: search` / redirect / 404 | frontmatter / path | Special routes |
| `status: draft` (OKF trust) | frontmatter | **Lifecycle** signal (draft / stable / deprecated) — **not** the same as `draft: true` publish gate |
| `site.findability.disallow` | `sorane.yaml` | `robots.txt` Disallow paths (crawl recommendation only) |

---

## Export matrix (measured 2026-08-03)

Legend:

- **yes** — included when that output is enabled
- **no** — excluded
- **n/a** — surface does not list per-page entries today
- **gap** — behavior differs from the intended product meaning above

Assumptions: production `sorane build` (**without** `--drafts`); outputs enabled as in `preset: okf-site`.

### By page control

| Output surface | normal page | `draft: true` | `excludeFromList: true` | `isSystem: true` | notes |
|----------------|-------------|---------------|---------------------------|------------------|-------|
| HTML page in `dist/` | yes | **no** | yes | no (content phase skips) | `includePageInBuild` / system skip in `build.ts` |
| Sibling `.md` alternate | yes* | **no** | yes* | no | *if `build.outputs.md_alternate` |
| Blog index / archive / tags | yes (articles) | **no** | **no** | no | `isBlogArticle` requires `excludeFromList !== true` |
| Atom `feed.xml` | yes (articles) | **no** | **no** | no | feed built from article summaries |
| `sitemap.xml` | yes | **no** | **yes** | no | built from `siteEntries` of emitted pages |
| `catalog.jsonld` hasPart / dataset | yes | **no** | **yes** | no | same emit loop as pages |
| `okf/bundle.tar.gz` | yes | **no** | yes | ? | uses `includePageInBuild` (same as HTML/OKFC) |
| `okf/site.okfc` | yes | **no** | yes | filtered via eligible | uses `includePageInBuild` |
| Search index (`sorane index`) | yes | **no** (`--drafts` to include) | yes | skips `isSystem` / 404 | drafts omitted from disk map + chunker |
| Browser search-index.json | follows index DB | follows index DB | yes | — | derive from index |
| `llms.txt` per-page list | **n/a** | n/a | n/a | n/a | links to catalogs / sitemap only; no page inventory |
| `robots.txt` per-page | **n/a** | n/a | n/a | n/a | path Disallow only (`site.findability.disallow`) |

### Site-level settings

| Control | Affects |
|---------|---------|
| `site.findability.disallow` | `robots.txt` Disallow lines only (not sitemap removal, not catalog) |
| `build.security.search_snippet_only` | Omits full `text` from browser search index (gov default) — privacy of **snippets**, not page membership |
| `preset: blog` vs `okf-site` | Whether catalog / llms / OKF / md alternate exist at all |

### Code anchors

| Behavior | Location |
|----------|----------|
| Draft publish gate | `includePageInBuild` + `isDraftFrontmatter` — `packages/core/src/build.ts`, `preview-banner.ts` |
| List exclusion | `isBlogArticle` — `excludeFromList !== true` |
| Sitemap / catalog membership | pushed in content emit loop after successful page build |
| OKF bundle (no draft filter) | `conceptBundleEntries` filter — type/index/404 only ~`build.ts` bundle section |
| OKFC eligibility | `toOkfcEligible` + `includePageInBuild` — `okfc-units.ts` |
| Search walk | `packages/search/src/build-index.ts` — all markdown files |
| `llms.txt` shape | `buildLlmsTxt` — `site-meta.ts` (no page list) |
| CSP | `security-headers.ts` |

---

## Gaps vs intended policy

| ID | Gap | Severity | Intended fix direction |
|----|-----|----------|------------------------|
| **G1** | ~~`draft: true` pages still enter **`okf/bundle.tar.gz`**~~ | ~~Medium~~ | **Fixed** — core `includePageInBuild` applies the publish gate to bundle entries |
| **G2** | ~~`draft: true` pages still enter **search index**~~ | ~~Medium~~ | **Fixed** — TS `chunkDocument` / `buildSearchIndex`; CLI `index --drafts`; Rust native index |
| **G3** | `excludeFromList` is **list-only**; still in sitemap, catalog, search, OKF | Low (if intentional) | Document as intentional **or** add `unlisted` / `noindex` for recommendation surfaces |
| **G4** | No single **existence inventory** with flags (Tsumugu `documents.json`) | Medium (agent UX) | Document catalog/OKFC as inventory **or** add `site-index.json` / `sorane list --json` (P1) |
| **G5** | `llms.txt` cannot express per-page hide/show | Low | Keep as recommendation guide; do not overload with full inventory |
| **G6** | OKF `status: draft` vs frontmatter `draft: true` naming collision | Low (docs) | Always disambiguate in AGENTS.md / okf-profile docs |

### Recommended product semantics (target)

After gap fixes and optional P1:

| Control | Existence (inventory) | Recommendation (sitemap, feed, lists, search, llms page links) | HTML public URL |
|---------|----------------------|------------------------------------------------------------------|-----------------|
| normal | yes | yes | yes |
| `draft: true` | no in prod artifacts | no | no (unless `--drafts`) |
| `excludeFromList` | yes | lists/feed **no**; sitemap/search **yes** (current) | yes |
| future `noindex: true` (optional) | yes (flagged) | sitemap/search **no**; inventory yes + flag | yes (URL still works) |

`excludeFromList` stays “don’t promote in blog chrome”. A separate flag (if added) should mean “don’t recommend to crawlers/indexers” without implying access control.

---

## Documentation surfaces (ship with implementation)

When principles are accepted:

| Audience | Where |
|----------|--------|
| Operators | `website/content/features.md` or new `trust-and-security.md` — three parties + CSP/sanitize summary |
| Agents | `template/site/AGENTS.md` — draft vs excludeFromList vs OKF status; export expectations |
| Design history | this file |

Do **not** duplicate full matrices in three places; link here from product docs and keep one measured table.

---

## Follow-up roadmap

### Done in this document (P0)

- [x] Trust slogan + three parties
- [x] Machine-output invariants M1–M5
- [x] Measured export matrix
- [x] Gap list G1–G6
- [x] G1/G2: production draft publish gate (OKF bundle + search index + docs)

### Next implementation (suggested order)

| Step | Work | Effort |
|------|------|--------|
| **1** | ~~Fix G1: draft filter on OKF bundle~~ | done |
| **2** | ~~Fix G2: draft filter on `sorane index` (+ tests)~~ | done |
| **3** | Product docs: trust page + matrix summary (link to this design) | S |
| **4** | ~~AGENTS.md: disambiguate `draft` vs `status` vs `excludeFromList`~~ | partial (field table) |
| **5** | P1: stable `code` on validate findings | M |
| **6** | P1: existence inventory (`list --json` or flagged catalog / registry contract) | M |
| **7** | Optional: `noindex` / recommendation flag separate from `excludeFromList` | M |
| **8** | P2: safer default for Mermaid client; CSP hash experiment | L |

### Explicit non-goals (near term)

- Zero-config (no `sorane.yaml`) as default product shape
- MDX execution model
- OpenAPI → unified semantic AST
- In-tree Mermaid subset engine

---

## Acceptance criteria (when implementing G1/G2)

1. `examples/` or fixture: page with `draft: true` → absent from HTML, sitemap, catalog, OKF bundle, OKFC, and search index on production build/index.
2. Same page with `sorane build --drafts` / preview → present in HTML (with draft banner); index behavior documented.
3. Page with `excludeFromList: true` only → still in sitemap/catalog/search/OKF; absent from feed and blog lists.
4. Tests cover matrix rows for draft + excludeFromList (table-driven preferred).

---

## Open questions

1. Should production **search index** treat `excludeFromList` as omit (stricter recommendation) or keep current “still findable”? Default proposal: **keep findable** (list ≠ search).
2. Should OKF bundle include a **manifest** row for drafts when `--drafts` is used (flagged) for local agent workflows?
3. Is `catalog.jsonld` the canonical existence inventory, or do we want a flatter agent-native JSON?

Record decisions here when answered.
