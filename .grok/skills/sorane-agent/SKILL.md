---
name: sorane-agent
description: >
  Develop or extend the sorane SSG monorepo (packages/core, cli, okf, tests).
  Use when implementing sorane features, fixing validate/build bugs, updating
  AGENTS.md or agent skills, or when the user says sorane development or /sorane-agent.
---

# sorane monorepo development

Repository: OKF-native SSG. Workspaces under `packages/*`, tests in `tests/`.

## Verify changes

```bash
npm run typecheck
npm test
npm run build -- --cwd examples/minimal --clean
```

Agent-facing features to keep aligned:

- `template/site/AGENTS.md` — content repo instructions
- `template/site/.grok/skills/sorane-content/SKILL.md` — site editing skill
- `sorane validate --json` — structured report (`packages/core/src/validate-site.ts`)

## validate --json schema

```json
{
  "schema_version": 1,
  "ok": true,
  "error_count": 0,
  "warning_count": 0,
  "files": [{ "file": "…", "ok": true, "findings": [] }]
}
```

Finding: `{ severity: "error"|"warning", category: "okf"|"diagram"|"heading", message, where?, instancePath? }`

## When changing validation

1. Update `packages/core/src/validate-site.ts`
2. Add tests in `tests/validate-json.test.ts`
3. Update `template/site/AGENTS.md` JSON example if shape changes
4. Update `website/content/cli.md`

## Do not

- Break `AGENTS.md` / skill parity (content agents depend on validate JSON contract)
- Publish npm packages without running full test suite