---
type: index
title: Open Data Example
description: sorane-okf/0.3 demo — dataset, reference, glossary, FAQ, and search.
profile: sorane-okf/0.3
---

This example site shows every extended OKF concept type in sorane-okf/0.3.

## Open data

- [Transit Stops](transit-stops.html) (`type: dataset`) — CSV distribution and DCAT-shaped `catalog.jsonld` entry
- [Transit Stops CSV Fields](stops-csv-fields.html) (`type: reference`) — column definitions linked to the CSV `resource`

## Supporting pages

- [Open Data Glossary](glossary.html) (`type: glossary`)
- [Open Data FAQ](faq.html) (`type: faq`)
- [Search](search.html) — full-text search with type facets (run `sorane index` before build)

## Machine-readable outputs

After `sorane build --clean`, see `dist/catalog.jsonld` (`dataset[]` vs `hasPart[]`), `dist/okf/bundle.tar.gz`, and per-page `.md` alternates.