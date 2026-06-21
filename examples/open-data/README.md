# open-data example (sorane-okf/0.3)

Minimal site demonstrating all extended OKF concept types and open-data output.

## Pages

| File | `type` | Built URL |
|------|--------|-----------|
| `content/index.md` | `index` | `index.html` |
| `content/transit-stops.md` | `dataset` | `transit-stops.html` |
| `content/stops-csv-fields.md` | `reference` | `stops-csv-fields.html` |
| `content/glossary.md` | `glossary` | `glossary.html` |
| `content/faq.md` | `faq` | `faq.html` |
| `content/search.md` | `article` (`view: search`) | `search.html` |

Static data: `static/stops.csv` (linked from the dataset distribution).

## Commands (from sorane repo root)

```bash
npx @sorane/cli validate --cwd examples/open-data --json
npx @sorane/cli index --cwd examples/open-data --force
npx @sorane/cli search "transit" --cwd examples/open-data --type dataset
npx @sorane/cli build --cwd examples/open-data --clean
```

## What to inspect in `dist/`

- `catalog.jsonld` — schema.org `dataset[]` / `hasPart[]`
- `catalog-dcat.jsonld` — DCAT-AP JSON-LD for datasets only (`site.open_data.dcat_catalog: true`)
- `transit-stops.html` — dataset landing (license, publisher, distributions)
- `faq.html` / `glossary.html` — section templates + JSON-LD (`mainEntity` / `hasDefinedTerm`)
- `stops-csv-fields.html` — reference layout + `isBasedOn` JSON-LD
- `assets/search-index.json` — after `index`; filter by `doc_type` or tags like `format:csv`

Agent instructions: [AGENTS.md](./AGENTS.md). Full OKF rules: [template/site/AGENTS.md](../../template/site/AGENTS.md).