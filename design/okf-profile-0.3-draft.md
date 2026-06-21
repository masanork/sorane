# sorane-okf/0.3 Profile Draft — Open Data & Extended Types

| Field | Value |
|-------|-------|
| **Status** | Draft (discussion) |
| **Date** | 2026-06-21 |
| **Base** | OKF v0.1 + sorane-okf/0.2 (AI disclosure) |
| **Target profile** | `sorane-okf/0.3` (additive; `0.1` / `0.2` remain valid) |

---

## 1. Purpose

Extend sorane’s OKF profile beyond `article` / `index` to support **datasets, FAQ, glossary, and reference** content—aligned with OKF’s open type model and European open-data practice (DCAT-AP, CKAN)—**without** turning sorane into a data portal.

Goals for 0.3:

1. Authors can declare machine-readable **dataset metadata** in frontmatter (license, publisher, distributions).
2. New `type` values have clear validation rules and predictable HTML / `catalog.jsonld` output.
3. Stay compatible with OKF bundles (`okf/bundle.tar.gz`) and agent workflows (`validate --json`).
4. Defer full DCAT-AP RDF, CKAN API, and portal features to later phases or external tools.

---

## 2. Standards landscape (what EU / catalogs actually require)

### 2.1 OKF v0.1 (upstream)

Source: [Google Cloud `okf/SPEC.md`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

| Topic | OKF position |
|-------|----------------|
| `type` | **Required**, free-form string; **no central registry** |
| Unknown types | Consumers **must not reject**; treat as generic concept |
| Examples | `BigQuery Table`, `BigQuery Dataset`, `Playbook`, `Reference`, `Metric` |
| Data shape | `resource` URI + body `# Schema` table for structured assets |
| Reserved files | `index.md` (directory listing, **no frontmatter**), `log.md` |

OKF is the **floor**: sorane profiles may be stricter, not looser on the single required field `type`.

### 2.2 DCAT-AP 3.0.1 (EU interoperability)

Source: [SEMIC DCAT-AP 3.0.1](https://semiceu.github.io/DCAT-AP/releases/3.0.1/) (SEMIC Recommendation, 2025-10)

Core graph: **Catalogue → Dataset → Distribution** (+ optional Data Service, Dataset Series, Agent).

**Provider must supply (high level):**

| Class | Mandatory (DCAT-AP) | Notes for sorane |
|-------|---------------------|------------------|
| Catalogue | `dct:title`, `dct:description` | Map from `sorane.yaml` `site.*` (already partial via `catalog.jsonld`) |
| Dataset | `dct:title`, `dct:description`, ≥1 `dcat:distribution` | New `type: dataset` concepts |
| Distribution | `dcat:accessURL`, `dct:format` *or* `dcat:mediaType` | `distributions[]` in frontmatter |
| Agent | `foaf:name` (when referenced) | `publisher` block |

**Heavily used recommended fields** (portal quality, harvesting):

- `dct:identifier`, `dct:license`, `dct:publisher`, `dcat:theme`, `dct:language`
- `dct:temporal`, `dct:spatial` (coverage)
- `dct:issued`, `dct:modified`, `prov:wasGeneratedBy`
- Controlled vocabs for licence, theme, format (EU publications)

**Explicit non-goals for sorane 0.3:** SHACL-valid DCAT-AP RDF export, Catalogue Record, Dataset Series, Data Service endpoints, multilingual literal arrays, INSPIRE geo constraints.

### 2.3 CKAN (de facto portal model)

Source: [CKAN user guide](https://docs.ckan.org/en/latest/user-guide.html)

| CKAN | Maps to |
|------|---------|
| Dataset metadata | `title`, `description`, `tags`, `license`, `organization`, `author` |
| Resource(s) | File/link + `name`, `description`, `format` |
| Organization | Out of scope (single-site `sorane.yaml` publisher) |
| API / Solr / workflow | Out of scope |

CKAN is a useful **authoring checklist**, not an implementation target. sorane static output ≈ “dataset landing page + downloadable resources”.

### 2.4 EU legal context (why metadata matters)

| Instrument | Relevance |
|------------|-----------|
| **Open Data Directive** (2019/1024) | Public sector datasets should be discoverable, machine-readable, with open licence |
| **High-value datasets** | Thematic metadata, API/ bulk access—sorane can link, not host APIs |
| **data.europa.eu harvesting** | Expects DCAT-AP (or mappable) catalogue feeds—not something a single static site must satisfy alone |

**Practical takeaway:** For a sorane site publishing CSV/API links, aim for **DCAT-AP-shaped frontmatter** that can be transformed to RDF by an external harvester, not in-site portal compliance.

---

## 3. sorane today vs target

| Area | Today (`0.2`) | Gap |
|------|---------------|-----|
| Allowed `type` | `article`, `index` only | Blocks `dataset`, `faq`, `glossary`, OKF-native `Reference` |
| `resource` | Parsed, rarely used | Should be required for `dataset` |
| `catalog.jsonld` | Every page → `schema.org/Dataset` + markdown `DataDownload` | No licence, publisher, CSV distribution, `dct:format` |
| `index.md` | `type: index` landing (frontmatter) | Differs from OKF directory `index.md` (no FM) |
| Build | Article / docs / blog layouts | No dataset landing template |

---

## 4. Profile design principles

1. **Layered strictness** — OKF allows any `type`; `sorane-okf/0.3` defines a **whitelist** with per-type required fields. Unknown types: **warning** + render as `article` (configurable), not hard error—unless `profile: sorane-okf/0.3` strict mode is enabled later.
2. **Reuse OKF conventions** — `# Schema`, `# Examples`, `# Citations` in body; `resource` for canonical asset URI.
3. **DCAT-shaped, not DCAT-serialized** — Frontmatter fields named for authors; `catalog.ts` maps to schema.org / DCAT-friendly JSON-LD.
4. **Static-first** — Distributions are URLs to `static/` files or external HTTPS; no upload pipeline.
5. **Additive versioning** — `0.3` extends `okfBase`; `0.1`/`0.2` sites unchanged.

---

## 5. Proposed concept types (`sorane-okf/0.3`)

### 5.1 Shared base (`okfBase`) — all types

Existing 0.2 fields unchanged:

`type`, `title`, `description`, `resource`, `tags`, `timestamp`, `profile`, AI disclosure fields.

**New optional blocks** (any type; required subsets per type below):

```yaml
# Open-data metadata (DCAT-AP inspired; flat author ergonomics)
identifier: "urn:uuid:…"          # or national ID URI
language: "ja"                    # BCP 47
license: "CC-BY-4.0"              # SPDX id or licence URI
publisher:
  name: "Example Municipality"
  url: "https://example.gov"
  email: "data@example.gov"       # optional
theme: "GOVE"                     # EU data-theme code or free tag
temporal:
  start: "2020-01-01"
  end: "2025-12-31"
spatial: "https://…"              # URI to GeoJSON or locn string (optional, loose)

# One or more downloadable representations (CKAN "resources")
distributions:
  - title: "2025 CSV"
    format: "csv"                 # short id; maps to dct:format / IANA media type
    accessURL: "https://…/data.csv"
    downloadURL: "https://…/data.csv"   # optional if same as accessURL
    byteSize: 1048576             # optional
    checksum: "sha256:…"          # optional
```

Validation notes:

- `license`: recommend SPDX ids (`CC-BY-4.0`, `CC0-1.0`, `EUPL-1.2`); warn on unknown strings.
- `distributions[].format`: normalize `csv` → `text/csv`, `json` → `application/json`, etc.
- `publisher.name`: required when `license` or `distributions` present (dataset accountability).

### 5.2 `article` (unchanged)

Blog / docs page. Same as 0.2.

### 5.3 `index` (unchanged semantics)

Site landing page (sorane-specific). **Not** OKF directory listing.

**Document in profile:** OKF bundle export may emit a separate `directory-index` file or exclude sorane `index` from cross-portal harvest—TBD in implementation.

### 5.4 `dataset` (new — primary open-data type)

| Field | Cardinality | Notes |
|-------|-------------|-------|
| `type` | const `dataset` | |
| `title` | required | DCAT `dct:title` |
| `description` | required | DCAT `dct:description` |
| `resource` | required | Canonical dataset URI (page URL or URN) |
| `license` | required | |
| `publisher` | required (`name`) | |
| `distributions` | ≥1 | CKAN resources / DCAT distributions |
| `timestamp` | recommended | `dct:modified` |

Body conventions:

- `# Schema` — column/field table (CSV, JSON schema summary)
- `# Examples` — sample rows or queries
- `# Citations` — provenance, methodology

Build output:

- HTML: dataset landing (title, description, licence badge, publisher, distribution table with download links, schema section)
- `catalog.jsonld`: full metadata + per-format `DataDownload` entries (not only `.md`)
- Search: index `doc_type: dataset`, facet on `format`, `theme`, `license`

**CSV use case:** One `content/dataset/annual-report-2025.md` + `static/data/annual-report-2025.csv` + distribution pointing to built URL.

### 5.5 `reference` (new — OKF-aligned)

Aligned with upstream `type: Reference` (enum tables, metric defs, external doc summaries).

| Field | Required |
|-------|----------|
| `title` | yes |
| `description` | recommended |
| `resource` | recommended (source URI) |

Body: tables, bullet definitions. Renders like docs article; catalog keywords include `reference`.

Use for: code lists, API field enums, **glossary term deep-dives** (single term).

### 5.6 `glossary` (new)

**Decision (2026-06-21):** Term-per-file is too verbose. Use **field-specific vocabulary files** (分野別語彙集); homonyms across glossaries are expected and in scope.

| Unit | Layout |
|------|--------|
| One glossary | `content/glossary/stats.md` → `type: glossary` |
| Many terms | Inside one file (structured body or `terms:` YAML) |
| Overlap | Same label (e.g. 「分散」) may differ by glossary; disambiguate by **glossary page + anchor `id`**, not global term slug |

Example:

```yaml
---
type: glossary
title: 一般行政統計 用語集
description: 総務省統計系ドキュメント向けの語彙。
profile: sorane-okf/0.3
identifier: "https://example.gov/glossary/stats"
language: ja
---

## 分散 {#variance}

標本の二乗偏差の平均。調査設計の文脈では…

## 標準誤差 {#standard-error}

…
```

Another file `content/glossary/ml.md` may also define 「分散」 with `{#variance}` pointing to a **different** definition (ML context). Cross-links: `[統計の分散](/glossary/stats.html#variance)`.

Optional structured form (validate either markdown `##` + `{#id}` or):

```yaml
terms:
  - id: variance
    label: 分散
    definition: "…"
    seeAlso: ["/glossary/ml.html#variance"]
```

JSON-LD: one glossary page → `DefinedTermSet`; terms → `hasDefinedTerm` / `DefinedTerm` (build-time extraction).

**No `glossary-term` type in 0.3** unless a later profile adds single-term pages for re-use as transclusion targets.

### 5.7 `faq` (new)

| Field | Required |
|-------|----------|
| `title` | yes |
| `description` | recommended |

Body structure (validate with heading lint):

```markdown
## Question one?
Answer paragraph.

## Question two?
Answer paragraph.
```

Optional structured form (phase 2):

```yaml
items:
  - question: "…"
    answer: "…"
```

JSON-LD: optional `FAQPage` when `build.json_ld.faq: true` (site config).

---

## 6. Type summary table

| `type` | Primary use | DCAT role | sorane build lift |
|--------|-------------|-----------|-------------------|
| `article` | docs, blog | — (documentation) | none |
| `index` | site home | Catalogue homepage | none |
| `dataset` | CSV/API open data | Dataset + Distribution | **medium** (template + catalog) |
| `reference` | enums, specs | — (supporting doc) | low (reuse docs) |
| `glossary` | 分野別語彙集（多 term / 1 file） | — (`DefinedTermSet`) | low–medium |
| `faq` | Q&A page | — | low (+ optional FAQPage) |

**Deferred types:** `playbook`, `metric`, `data-service`, `dataset-series`, `BigQuery Table` (use free-form `type` + warning in 0.3 if needed).

---

## 7. `catalog.jsonld` — breaking split (discussion outcome)

### 7.1 Problem with status quo

Today every built page → `schema.org/Dataset` inside `DataCatalog.dataset` ([`catalog.ts`](../packages/core/src/catalog.ts)).

| Issue | Why it matters |
|-------|----------------|
| DCAT/EU semantics | A blog post is not a **Dataset** (no distributable data collection) |
| Harvesting noise | Portal crawlers may treat docs as open-data records missing `license` / `distribution` |
| Agent confusion | `Dataset` implies CSV/API-style reuse; docs are **CreativeWork** |

Historical rationale was “one machine-readable list for agents.” That job is already covered by **`okf/bundle.tar.gz`** and per-page `.md` alternates.

### 7.2 Decision: **do not put articles in `dataset`**

**Breaking change accepted.** `catalog.jsonld` should mean “what this site publishes as catalogued **knowledge / data products**,” split by type:

| `type` | `catalog.jsonld` placement | `@type` |
|--------|---------------------------|---------|
| `dataset` | `DataCatalog.dataset[]` | `Dataset` (+ full DCAT-shaped fields) |
| `article` | `DataCatalog.hasPart[]` | `BlogPosting` **or** `TechArticle` (see §7.7) |
| `reference` | `hasPart[]` | `TechArticle` |
| `faq` | `hasPart[]` | `FAQPage` |
| `glossary` | `hasPart[]` | `DefinedTermSet` |
| `index` | omit or `hasPart` as `WebPage` | site chrome only |

`schema.org/DataCatalog` supports **`dataset`** and **`hasPart`** (from `CreativeWork`). One file, two buckets—agents filter by property.

### 7.3 Example shape (0.3)

```json
{
  "@context": { "@vocab": "https://schema.org/", "dcat": "http://www.w3.org/ns/dcat#" },
  "@type": "DataCatalog",
  "name": "Example site",
  "url": "https://example.gov/",
  "publisher": { "@type": "Organization", "name": "…" },
  "dataset": [
    {
      "@type": "Dataset",
      "@id": "https://example.gov/dataset/budget-2025.html",
      "name": "…",
      "license": "https://creativecommons.org/licenses/by/4.0/",
      "distribution": [
        { "@type": "DataDownload", "encodingFormat": "text/csv", "contentUrl": "…" }
      ]
    }
  ],
  "hasPart": [
    {
      "@type": "TechArticle",
      "@id": "https://example.gov/getting-started.html",
      "name": "Getting started",
      "distribution": [
        { "@type": "DataDownload", "encodingFormat": "text/markdown", "contentUrl": "…/getting-started.md" }
      ]
    },
    {
      "@type": "DefinedTermSet",
      "@id": "https://example.gov/glossary/stats.html",
      "name": "一般行政統計 用語集"
    }
  ]
}
```

Markdown `DataDownload` on articles **stays** under `hasPart`—agents still get `.md` URIs without mislabeling pages as datasets.

### 7.4 Discoverability after the break

| Consumer need | Surface |
|---------------|---------|
| All concepts (agents) | `okf/bundle.tar.gz` (unchanged) |
| Open data only | `catalog.jsonld` → `dataset[]` |
| Docs + data sitemap | `catalog.jsonld` full file or `hasPart` + `dataset` |
| Human | `llms.txt` — update copy: bundle = full corpus; catalog = typed index |

`llms.txt` line change (draft):

```text
- [OKF bundle](…): all concepts ({type}/{slug}.md)
- [Site catalog](catalog.jsonld): datasets in `dataset[]`; pages in `hasPart[]`
```

### 7.5 Migration — hard break (decided)

- **Breaking** for tools that assumed `catalog.dataset` contains every URL.
- **No `catalog-legacy.jsonld`.** Ship split catalog in 0.3; document in CHANGELOG only.
- Tests: rewrite `tests/catalog.test.ts` for `dataset[]` / `hasPart[]` assertions.
- Page-level JSON-LD (`<script type="application/ld+json">`) should use the **same** `@type` as `catalog.jsonld` for that page (today always `BlogPosting` — align in 0.3).

### 7.7 `TechArticle` vs `BlogPosting` for `type: article` (decided)

Both occur depending on site shape—not a single global choice.

| Condition | `catalog.jsonld` + page JSON-LD `@type` |
|-----------|----------------------------------------|
| **Docs site** (`sorane.yaml` `nav:` present → `docsMode`) | `TechArticle` |
| **Blog site** (index + archive/tag flows; no docs nav) | `BlogPosting` |
| **Override** | frontmatter `creativeWorkType: TechArticle` or `BlogPosting` wins |

`reference` → always `TechArticle` (spec-like content).

Implementation notes:

- Rename or generalize `buildBlogPostingJsonLd()` → `buildArticleJsonLd({ workType })`.
- `BlogPosting` keeps `isPartOf: { @type: Blog, … }`; `TechArticle` uses `isPartOf: { @type: WebSite, … }` or docs collection name.
- `emit-page.ts` `pageKind` stays OG-oriented (`article` / `website`); JSON-LD type is a separate field.

### 7.6 Optional later: `catalog-dcat.jsonld`

Full DCAT-AP RDF (`dct:`, `dcat:`, `foaf:`) export **only** for `dataset[]` entries—phase 2, for national portal harvest—not a replacement for schema.org `catalog.jsonld`.

Add `sorane.yaml`:

```yaml
site:
  publisher:
    name: "…"
    url: "…"
  open_data:
    default_license: "CC-BY-4.0"
```

---

## 8. OKF `index.md` vs sorane `index`

| | OKF SPEC | sorane today |
|--|----------|--------------|
| File | `**/index.md` | `content/index.md` |
| Frontmatter | none | `type: index` required |
| Body | directory listing | site intro |

**0.3 policy (draft):**

- `content/index.md` remains sorane landing (`type: index`).
- Subdirectory `content/datasets/index.md` **may** use OKF-style listing (no FM) if we add a generator; otherwise `type: glossary` / nav handles discovery.
- Export to `okf/bundle.tar.gz`: document that sorane `index` is profile extension; optional `okf_version: "0.1"` in bundle metadata file.

---

## 9. Validation tiers

| Tier | Behaviour |
|------|-----------|
| **0.1 / 0.2 sites** | Unchanged |
| **0.3 strict** | Whitelist types; `dataset` enforced fields |
| **0.3 unknown type** | **Warning** + render/build as `article` (confirmed) |

**Decision (2026-06-21):** Default `unknown_type: warn` with `article` fallback—preserves OKF spirit (tolerate unknown types) while keeping sorane layouts predictable.

Per-file `profile:` selects schema; missing profile defaults to `0.1` behaviour unless `sorane.yaml` sets `okf.default_profile`. Site-wide `sorane.yaml` (**shipped**):

```yaml
okf:
  default_profile: "sorane-okf/0.3"
  unknown_type: warn   # warn only in 0.3; error optional for strict sites
```

---

## 10. Phased implementation

### Phase A — Profile & validate only (smallest)

- [ ] `profile/sorane-okf-0.3.schema.json`
- [ ] `validate.ts` whitelist + `dataset` / `distributions` rules
- [ ] Tests + `validate --json` messages
- [ ] Unknown types warn + treat as `article` in build

### Phase B — Dataset & catalog

- [ ] `dataset` HTML template
- [ ] `catalog.ts` mapping (licence, publisher, multi-distribution)
- [ ] Example in `examples/open-data/`
- [ ] `website/content/okf-profile.md` update

### Phase C — FAQ / glossary / reference

- [ ] `faq` heading validator
- [ ] `glossary-term` + tag-like index
- [ ] `reference` layout tweaks

### Phase D — External interop (optional)

- [ ] `catalog-dcat.jsonld` DCAT-AP JSON-LD export
- [ ] CKAN harvest mapping doc (manual import steps)
- [ ] data.europa.eu quality checklist crosswalk

---

## 11. Example: CSV dataset page

```yaml
---
type: dataset
title: 令和7年度 予算執行状況
description: 月次の予算執行額（千円）を機関別に公開する CSV。
profile: sorane-okf/0.3
resource: https://example.gov/dataset/budget-2025
identifier: "https://example.gov/id/dataset/budget-2025"
license: CC-BY-4.0
language: ja
publisher:
  name: 例市役所
  url: https://example.gov
theme: GOVE
timestamp: 2026-06-01T00:00:00Z
tags: [budget, csv, open-data]
distributions:
  - title: 予算執行 CSV（UTF-8）
    format: csv
    accessURL: /data/budget-2025.csv
    byteSize: 245760
    checksum: "sha256:abc…"
---

# Schema

| 列名 | 型 | 説明 |
|------|-----|------|
| `year_month` | string | 対象年月 (YYYY-MM) |
| `agency_code` | string | 機関コード |
| `amount_kyen` | integer | 執行額（千円） |

# Citations

[1] [予算条例 第12条](https://example.gov/law/budget)
```

---

## 12. Open questions

1. ~~Unknown types~~ → **warn + `article` fallback** (decided).
2. ~~Glossary~~ → **分野別 `type: glossary`、語は1ファイル内、同形異義語は glossary + anchor で区別** (decided).
3. ~~`catalog.jsonld` articles in `dataset`?~~ → **No; `hasPart` for non-data** (decided, breaking).
4. **OKF directory `index.md`:** generate automatically under `content/datasets/` etc.?
5. **EU theme codes:** validate against EU vocabulary or free string + warn?
6. **Search:** unified index with `type` facet vs dataset-only filter?
7. ~~**`article` JSON-LD type**~~ → docs = `TechArticle`, blog = `BlogPosting`, `creativeWorkType` override (decided).
8. ~~**Legacy catalog**~~ → **hard break**, no legacy file (decided).

---

## 13. References

- [OKF SPEC v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [DCAT-AP 3.0.1](https://semiceu.github.io/DCAT-AP/releases/3.0.1/)
- [CKAN User Guide](https://docs.ckan.org/en/latest/user-guide.html)
- [sorane `catalog.ts`](../packages/core/src/catalog.ts)
- [sorane-okf/0.2 schema](../profile/sorane-okf-0.2.schema.json)