# OKF v0.2 trust signals — sorane alignment

| Field | Value |
|-------|-------|
| **Status** | Implemented (P0–P2 light) |
| **Date** | 2026-08-01 |
| **Upstream** | [OKF SPEC.md v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (2026-07-25) |
| **sorane profiles** | `sorane-okf/0.1`–`0.3` (all accept optional trust families) |

---

## Naming: two different “0.2”s

| Name | Meaning |
|------|---------|
| **OKF v0.2** | Upstream Open Knowledge Format (Google Cloud knowledge-catalog) |
| **`sorane-okf/0.2`** | sorane profile that adds **AI disclosure** (IPTC / EU labels) on top of OKF |

Both sit on the OKF field model. Profile `0.2` is **not** “the profile that implements only OKF v0.2”; trust fields are available on `0.1` / `0.2` / `0.3`.

---

## What was implemented

### Parse / normalize (`@sorane/okf`)

| Field | Behavior |
|-------|----------|
| `generated: { by, at }` | First-class on `OkfConcept`; `by` required when present |
| `verified` | Bare mapping or list → always a list on the concept |
| `sources[]` | Each entry requires `resource` |
| `usage_window` | Shared `{ from, to }` sibling of `sources` |
| `status` | `draft` \| `stable` \| `deprecated` |
| `stale_after` | `YYYY-MM-DD`; past date → validate **warning** |
| **Date fallback** | Effective `timestamp` = legacy `timestamp` / `date` / `publishedAt`, else `generated.at` (OKF §13.1) |

Helpers: `deriveTrustTier`, `isStale`, `parseTrustFields`.

### Schema

Optional shapes in `sorane-okf-0.{1,2,3}.schema.json` (copied to `profile/`, `rust/.../profile/`, `website/static/profile/`).

### Surfaces

| Surface | Behavior |
|---------|----------|
| OKF bundle / `.md` alternate | Serialize trust families |
| HTML article meta | status (non-stable), trust tier, stale, `generated.by` |
| `catalog.jsonld` | keywords `status:`, `trust:`, `stale_after:`, `generated_by:`; `citation` from `sources` |
| Rust astro backend | `generated.at` → timestamp fallback |

### Deferred (P3)

- Full `Attested Computation` runtime / executor / attester
- Search facets for trust tier / status
- `okf_version` on bundle-root index
- Automatic `timestamp` → `generated` migrate rewrite

---

## Author example

```yaml
---
type: article
title: Customer Orders
profile: sorane-okf/0.3
status: stable
stale_after: 2026-12-31
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
verified: { by: human:alice, at: 2026-06-25T09:00:00Z }
sources:
  - id: warehouse-schema
    resource: https://wiki.example/schemas/sales
    title: Sales warehouse schema
    author: team:data-platform
    last_modified: 2026-06-15
---

Body with footnotes keyed to source ids when attributing claims.[^warehouse-schema]

[^warehouse-schema]: Sales warehouse schema
```

AI disclosure (`digitalSourceType`, `euAiLabel`, …) remains independent and complementary.
