---
name: sorane-content
description: >
  Edit sorane static site content (Markdown + OKF frontmatter). Use when adding or
  updating pages under content/, fixing validate errors, running sorane build, or when
  the user mentions sorane site, OKF frontmatter, AGENTS.md, or /sorane-content.
---

# sorane content editing

You maintain a **sorane** site: `content/` + `sorane.yaml`. No admin UI.

## Before editing

1. Read `AGENTS.md` at repo root
2. Read `sorane.yaml`
3. Read the target `content/**/*.md` and nearby articles for tone/structure

## After every edit

```bash
npx @sorane/cli validate --cwd . --json
```

Parse JSON stdout:

- Stop and fix if `ok === false`
- Fix every finding with `severity: "error"` (usually `category: "okf"`)
- Treat `warning` findings as fixes when practical:
  - `diagram` / `heading` / `image` / `link` — a11y
  - `table` / `date` / `revision` — structure and metadata
  - `faq` / `glossary` / `glossary-term` / `reference` / `dataset` — OKF 0.3 page shapes (when `profile: sorane-okf/0.3`)
  - `i18n` — `translation_key` / locale sibling consistency (`site.i18n`)

## Full publish loop

```bash
npx @sorane/cli validate --cwd . --json
npx @sorane/cli index --cwd . --force    # only if content/search.md exists
npx @sorane/cli build --cwd . --clean
```

## Content rules (short)

- Edit only `content/` and `sorane.yaml`; never `dist/`
- Required frontmatter: `type`, `title`, `profile` (`sorane-okf/0.1`|`0.2`|`0.3`; `0.3` adds `dataset`, `reference`, `glossary`, `glossary-term`, `faq`)
- Body headings start at `##` (title is already h1)
- Mermaid/diagram fences need alt text when diagrams are enabled
- **i18n:** default locale in `content/`; others under `content/{path_prefix}/`; optional `translation_key` to link siblings
- **revisions:** optional `[{ date, summary }]` on articles (newest first); `validate` warns on bad shape
- **emergency / hosting:** edit `sorane.yaml` only (`site.emergency`, `site.hosting.cloudflare`); sorane does not inject analytics JS
- **0.3 templates:** see `examples/open-data/` in the sorane repo (dataset landing, reference table, glossary/faq sections, search facets)

## OKF 0.3 quick reference

| type | Required / recommended |
|------|------------------------|
| `dataset` | `description`, `resource`, `license`, `publisher`, `distributions[]` |
| `reference` | `title`; `description`, `resource`, GFM table recommended |
| `glossary` | `## Term {#id}` sections or `terms:` YAML |
| `glossary-term` | `term_id`, `inDefinedTermSet` or `glossary` (parent href); body = one definition |
| `faq` | `## Question?` sections |

## On validate failure

1. Group `files[].findings` by `file`
2. Fix OKF errors first (`where`: `type`, `profile`, `frontmatter`, `structure`)
3. Re-run `validate --json` until `ok === true`
4. Report remaining warnings to the user briefly

## Do not

- Compare to other CMS/SSG products
- Add unsupported frontmatter without user approval
- Commit `dist/`, `.sorane/`, `node_modules/`