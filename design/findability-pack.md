# Findability pack (Phase 1)

Public-sector and agent discoverability improvements for sorane static sites.

## Scope

| Output | Change |
|--------|--------|
| `WebSite` JSON-LD | `publisher` (`GovernmentOrganization`), `SearchAction` |
| Page JSON-LD | `publisher`, `identifier` / `subject` / `audience` / `coverage` from frontmatter |
| `BreadcrumbList` JSON-LD | Home → current page |
| `sitemap.xml` | `lastmod` = max(`timestamp`, `updated`) |
| `robots.txt` | optional `Disallow` paths |
| `llms.txt` | `## Publisher`, `## Contact` |
| `catalog.jsonld` | site-level `publisher` with org type |
| Client search | `?q=` query on search page (SearchAction target) |

## Configuration (`sorane.yaml`)

```yaml
site:
  organization:
    name: Example Digital Agency
    url: https://www.example.go.jp/
    type: GovernmentOrganization   # or Organization
    same_as:
      - https://github.com/example
  contact:
    page: contact.html
    email: info@example.go.jp
  findability:
    breadcrumbs: true
    search_action: true
    disallow:
      - /assets/search/lib/
```

## Article frontmatter (optional)

```yaml
identifier: GOV-2025-001
subject: 統計
audience: 一般
coverage: 東京都
updated: 2025-06-01
```

## Roadmap (this initiative)

1. **Findability pack** (this doc) — done in core
2. **validate** public quality gates — see [quality-gates.md](./quality-gates.md)
3. **Multilingual / hreflang** — see [i18n.md](./i18n.md)
4. **Emergency banner + revision history** — see [emergency-revision.md](./emergency-revision.md)
5. **Access logs** — Cloudflare stack templates + sorane hooks