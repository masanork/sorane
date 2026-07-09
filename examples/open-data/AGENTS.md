# 空音 open-data example (monorepo)

In-repo demo for **`sorane-okf/0.3`**: `dataset`, `reference`, `glossary`, `faq`, plus search.

## Commands (from sorane repo root)

```bash
npx @sorane/cli validate --cwd examples/open-data --json
npx @sorane/cli index --cwd examples/open-data --force
npx @sorane/cli build --cwd examples/open-data --clean
```

## Content map

- `transit-stops.md` — `type: dataset` (required open-data frontmatter + distributions)
- `stops-csv-fields.md` — `type: reference` (GFM table + `resource` URI)
- `glossary.md` / `faq.md` — `##` sections with `{#id}` anchors
- `search.md` — `view: search` (run `index` before build for `search-index.json`)

## validate `--json` categories for 0.3

Besides `okf` / `heading` / `diagram`, expect optional warnings from:

- `dataset` — license, distribution URLs
- `reference` — description, `resource`, GFM tables
- `glossary` / `faq` — `##` structure, anchors, empty sections

Fix all `error` findings before commit. See [README.md](./README.md) and [template/site/AGENTS.md](../../template/site/AGENTS.md).