# sorane site — agent instructions

You edit a **sorane** static site: Markdown + YAML frontmatter in `content/`, configured by `sorane.yaml`. There is no admin UI. Humans and agents publish by committing to Git.

**Core loop:** edit `content/` → `validate --json` → fix errors → `build --clean` → commit.

## Your role

- Add and update pages under `content/`
- Keep frontmatter valid for OKF (`sorane-okf/0.1`, `0.2`, or `0.3`)
- Run **`validate --json`** after every content change; parse JSON and fix all `severity: "error"` findings
- Run `build --clean` before suggesting deploy
- Do **not** hand-edit `dist/` (generated)

## Repository layout

```
.
├── AGENTS.md              ← you are here
├── .grok/skills/sorane-content/SKILL.md   ← slash /sorane-content
├── sorane.yaml
├── content/
│   ├── index.md           ← landing (type: index)
│   ├── article/           ← posts (type: article)
│   └── search.md          ← optional FTS search UI (view: search)
└── dist/                  ← build output (gitignored)
```

## Commands (preferred: npm)

```bash
npx @sorane/cli validate --cwd . --json
npx @sorane/cli index --cwd . --force    # if content/search.md exists
npx @sorane/cli build --cwd . --clean
```

Fork / monorepo with sorane checkout: set `SORANE_ROOT` and use `node "$SORANE_ROOT/packages/cli/bin/sorane.mjs"` instead.

## validate --json (agent contract)

Always run with `--json`. Parse stdout as JSON.

| Field | Meaning |
|-------|---------|
| `ok` | `true` only when `error_count === 0` (warnings allowed) |
| `error_count` / `warning_count` | Totals across all files |
| `files[].file` | Path relative to `content/` |
| `files[].findings[]` | `{ severity, category, message, where?, instancePath? }` |

**Severity**

- `error` — must fix before commit (`category: "okf"` is frontmatter / profile)
- `warning` — fix when practical:
  - `diagram` / `heading` / `image` / `link` / `table` / `date` / `lang` / `revision` — a11y and metadata
  - `faq` / `glossary` / `reference` / `dataset` — sorane-okf/0.3 body and open-data structure (0.3 only)
  - `i18n` — `translation_key` / locale sibling consistency (`site.i18n`)

**Workflow**

1. Run `validate --cwd . --json`
2. If `!ok`, group findings by `files[].file` and fix each `error`
3. Re-run until `ok === true`
4. Optionally address `warning` findings (a11y / headings)

Example (invalid type):

```json
{
  "schema_version": 1,
  "ok": false,
  "error_count": 1,
  "warning_count": 0,
  "files": [
    {
      "file": "article/bad.md",
      "ok": false,
      "findings": [
        {
          "severity": "error",
          "category": "okf",
          "where": "type",
          "message": "Unsupported concept type \"playbook\"; supported: article, index"
        }
      ]
    }
  ]
}
```

## Content rules

Every page is Markdown with YAML frontmatter (`---` … `---`).

### Required

| Field | Rule |
|-------|------|
| `type` | `article` or `index` (`0.3` also: `dataset`, `reference`, `glossary`, `glossary-term`, `faq`) |
| `title` | Non-empty string |
| `profile` | `sorane-okf/0.1`, `0.2`, or `0.3` (omit when `sorane.yaml` sets `okf.default_profile`) |

### Common optional fields

| Field | Use |
|-------|-----|
| `timestamp` | ISO 8601 for articles |
| `tags` | `[tag1, tag2]` |
| `description` | Short summary |
| `excludeFromList` | `true` — hide from blog lists |
| `view` | `search` — search UI page |
| `digitalSourceType` | AI disclosure (`0.2` only) — see sorane.dev/ai-disclosure.html |
| `translation_key` | Groups locale siblings when filenames differ (`site.i18n`) |
| `lang` | Overrides page `<html lang>` (per-locale sites) |
| `revisions` | Update history table: `[{ date, summary }]` newest-first |
| `updated` | Sitemap `lastmod` + findability metadata |
| `identifier` / `subject` / `audience` / `coverage` | Public-sector findability (optional) |

### Multilingual (`site.i18n`)

When `sorane.yaml` defines `site.i18n.locales`:

- Default locale lives at `content/` root
- Other locales mirror paths under `content/{path_prefix}/` (e.g. `content/en/about.md`)
- Use the same relative path when possible; otherwise set matching `translation_key` on each locale file
- Emergency banner copy can use `site.emergency.locales.{id}` in `sorane.yaml` (not in Markdown)

### Site config (not in Markdown)

| `sorane.yaml` block | Agent edits? |
|---------------------|--------------|
| `site.organization` / `contact` / `findability` | Yes, when user asks for publisher/search/robots |
| `site.emergency` | Yes, for site-wide alerts |
| `site.hosting.cloudflare` | Yes, when user sets up Pages + analytics (no HTML beacon) |
| `build.quality` | Yes, to toggle validate warnings |

### Article example

```markdown
---
type: article
title: My post
timestamp: 2025-06-20T12:00:00Z
tags: [notes]
profile: sorane-okf/0.1
---

Body in Markdown. Start headings at `##` (page title is already h1).
```

### sorane-okf/0.3 types (summary)

| `type` | Body pattern | Notes |
|--------|--------------|-------|
| `dataset` | prose + optional `# Schema` | Requires `description`, `resource`, `license`, `publisher`, `distributions` |
| `reference` | GFM tables, enums | `description` and `resource` recommended |
| `glossary` | `## Term {#id}` per entry | Or `terms:` in frontmatter when body has no `##` |
| `faq` | `## Question?` then answer | One question per `##` heading |

Full examples: [examples/open-data/](https://github.com/masanork/sorane/tree/main/examples/open-data) in the sorane repo.

### Search (optional)

Add `content/search.md` with `view: search`, then:

```bash
npx @sorane/cli index --cwd . --force
npx @sorane/cli build --cwd . --clean
```

Search UI facets include `article`, `dataset`, `reference`, `glossary`, and `faq`. Dataset pages index `license:` / `format:` tags for CLI `--tag`.

## Agent workflow (checklist)

1. Read `sorane.yaml` and target `content/**/*.md`
2. Edit Markdown under `content/` only
3. `validate --cwd . --json` → fix all errors
4. If `content/search.md` exists: `index --cwd . --force`
5. `build --cwd . --clean`
6. Summarize changes for the human commit message

## Do not

- Invent unknown `profile` strings; on `0.1`/`0.2` only `article` and `index` are valid types
- Add server-side runtime, databases, or CMS plugins
- Commit `dist/`, `.sorane/`, or `node_modules/`
- Hand-edit generated `dist/`

## Machine-readable outputs (after build)

`dist/llms.txt`, `catalog.jsonld`, `okf/bundle.tar.gz`, per-page `.md` alternates — use these to answer questions about the **published** site.

## Docs

- https://sorane.dev/
- AI onboarding: https://sorane.dev/ai-onboarding.html
- OKF profile: https://sorane.dev/okf-profile.html