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
npx @sorane/cli@0.2.7 validate --cwd . --json
npx @sorane/cli@0.2.7 index --cwd . --force    # if content/search.md exists
npx @sorane/cli@0.2.7 build --cwd . --clean
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
- `warning` — fix when practical (`diagram` = diagram alt, `heading` = hierarchy, `image` = image alt, `link` = generic link text, `table` = table headers, `date` = timestamp/updated, `revision` = revisions frontmatter)

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
| `type` | `article` or `index` (`0.3` also: `dataset`, `reference`, `glossary`, `faq`) |
| `title` | Non-empty string |
| `profile` | `sorane-okf/0.1`, `0.2`, or `0.3` |

### Common optional fields

| Field | Use |
|-------|-----|
| `timestamp` | ISO 8601 for articles |
| `tags` | `[tag1, tag2]` |
| `description` | Short summary |
| `excludeFromList` | `true` — hide from blog lists |
| `view` | `search` — search UI page |
| `digitalSourceType` | AI disclosure (`0.2` only) — see sorane.dev/ai-disclosure.html |

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