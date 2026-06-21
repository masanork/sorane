# Markup golden fixtures

Contract tests for `design/markup-interchange.md`.

## Layout

| File | Purpose |
|------|---------|
| `*.md` | Input Markdown (body only; no frontmatter) |
| `*.html` | Expected `pandocToHtml(mdastToPandoc(processMarkdownToMdast(md)))` output |
| `*.index.json` | Optional `GlossaryLinkIndex` for term-link fixtures |

## Running (after PR1+)

```bash
npm test -- tests/markup-golden.test.ts
```

## Normalization

Compare after:

- trimming trailing newline on expected HTML
- collapsing `\n\n` between adjacent block elements to single `\n` (see `markup-interchange.md`)