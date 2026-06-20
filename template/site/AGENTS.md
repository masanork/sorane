# sorane site — agent instructions

You edit a **sorane** static site: Markdown + YAML frontmatter in `content/`, configured by `sorane.yaml`. There is no admin UI. Humans and agents publish by committing to Git.

## Your role

- Add and update pages under `content/`
- Keep frontmatter valid for OKF profile `sorane-okf/0.1`
- Run `validate` after content changes; run `build` before suggesting deploy
- Do **not** hand-edit `dist/` (generated)

## Repository layout

```
.
├── AGENTS.md          ← you are here (Cursor, Claude Code, Antigravity, Codex, …)
├── sorane.yaml        ← site config
├── content/
│   ├── index.md       ← landing (type: index)
│   ├── article/       ← posts (type: article)
│   └── search.md      ← optional FTS search UI (view: search)
└── dist/              ← build output (gitignored)
```

## Content rules

Every page is a Markdown file with YAML frontmatter (`---` … `---`).

### Required

| Field | Rule |
|-------|------|
| `type` | `article` or `index` |
| `title` | Non-empty string |
| `profile` | `sorane-okf/0.1` |

### Common optional fields

| Field | Use |
|-------|-----|
| `timestamp` | ISO 8601 (`2025-01-01T00:00:00Z`) for articles |
| `tags` | `[tag1, tag2]` |
| `description` | Short summary |
| `excludeFromList` | `true` — hide from blog lists (docs, search page) |
| `view` | `search` — search UI page |
| `githubUrl` | External link on index |

### Article example

```markdown
---
type: article
title: My post
timestamp: 2025-06-20T12:00:00Z
tags: [notes]
profile: sorane-okf/0.1
---

Body in Markdown.
```

### Index example

```markdown
---
type: index
title: Site name
description: One-line lead
profile: sorane-okf/0.1
---

Optional intro paragraph.
```

## Commands

Set `SORANE_ROOT` to a local clone of [masanork/sorane](https://github.com/masanork/sorane) (sibling directory `../sorane` is typical).

```bash
export SORANE_ROOT=../sorane
CLI="node $SORANE_ROOT/packages/cli/src/main.ts"

$CLI validate --cwd .
$CLI index --cwd . --force    # if search.md exists
$CLI build --cwd . --clean
```

CI usually checks out sorane and runs the same commands (see `.github/workflows/pages.yml`).

## Workflow for agents

1. Read `sorane.yaml` and nearby `content/**/*.md` before editing.
2. Create or update Markdown under `content/` only.
3. Run `validate --cwd .`. Fix all reported frontmatter / OKF issues.
4. If the site has `content/search.md`, run `index --cwd . --force`.
5. Run `build --cwd . --clean`. Confirm `dist/` looks correct.
6. Summarize changes for the human commit message.

## Do not

- Add WordPress-style plugins, databases, or server-side runtime
- Invent frontmatter keys that break `sorane-okf/0.1` without user approval
- Commit `dist/`, `.sorane/`, or `node_modules/`
- Replace the whole site generator; this repo is **content**, sorane is the **tool**

## Machine-readable outputs (after build)

sorane emits agent-friendly artifacts in `dist/`: `llms.txt`, `catalog.jsonld`, `okf/bundle.tar.gz`, per-page `.md` alternates. Point other agents at those when answering questions about the live site.

## Docs

- https://ssg.sorane.dev/
- OKF profile: https://ssg.sorane.dev/okf-profile.html