# Knowledge indexing and search

Sorane uses Markdown with OKF frontmatter as its authoring format. The build
normalizes pages into concepts and text chunks, then writes two query surfaces:

- `okf/site.okfc`: a SQLite FTS pack for sharing, distribution, and agent queries.
- `assets/search-index.json`: a compact projection used by browser search.
- `.sorane/index.db`: an incremental local work index maintained by `sorane index`.

The SQLite stores use FTS5; browser search uses the browser's FTS-compatible
index. Search
does not download or run an embedding model. The OKFC format can still contain
vector tables from older Sorane versions; current builds and queries use FTS.

## Build path

```text
content/**/*.md
    → OKF concepts
    → shared concept chunks
    ├→ okf/site.okfc
    └→ assets/search-index.json
```

Concept identity is `{type}/{slug}`. The source file path remains the key for
incremental indexing. `sorane index` maintains `.sorane/index.db` for local
work. Its presence opts the build into header search. `sorane build` or
`sorane okfc pack` creates OKFC for sharing. The browser search index is
regenerated from the current build corpus, not the local work index.
`sorane search` uses OKFC when present; `--prefer-index` selects the local
index.

## Code map

| Piece | Location |
|-------|----------|
| Knowledge IR and shared chunks | `packages/okf/src/knowledge-ir.ts` |
| OKFC packing and FTS schema | `packages/okf/src/okfc-pack.ts` |
| Site search index | `packages/search/src/build-index.ts` |
| Local FTS store | `packages/search/src/store.ts` |
| CLI backend selection | `packages/cli/src/search-cmd.ts` |

Browser search reads JSON and does not open SQLite. Local and agent tools query
OKFC packs or the local index through SQLite FTS.
