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
npx @sorane/cli@0.2.4 validate --cwd . --json
```

Parse JSON stdout:

- Stop and fix if `ok === false`
- Fix every finding with `severity: "error"` (usually `category: "okf"`)
- Treat `warning` + `category: "diagram"` or `"heading"` as a11y fixes when practical

## Full publish loop

```bash
npx @sorane/cli@0.2.4 validate --cwd . --json
npx @sorane/cli@0.2.4 index --cwd . --force    # only if content/search.md exists
npx @sorane/cli@0.2.4 build --cwd . --clean
```

## Content rules (short)

- Edit only `content/` and `sorane.yaml`; never `dist/`
- Required frontmatter: `type` (`article`|`index`), `title`, `profile` (`sorane-okf/0.1` or `0.2`)
- Body headings start at `##` (title is already h1)
- Mermaid/diagram fences need alt text when diagrams are enabled

## On validate failure

1. Group `files[].findings` by `file`
2. Fix OKF errors first (`where`: `type`, `profile`, `frontmatter`, `structure`)
3. Re-run `validate --json` until `ok === true`
4. Report remaining warnings to the user briefly

## Do not

- Compare to other CMS/SSG products
- Add unsupported frontmatter without user approval
- Commit `dist/`, `.sorane/`, `node_modules/`