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
npm run stats                  # LOC / test ratio / workspace breakdown
npm run stats:json             # machine-readable snapshot
```

Optional: `npm run stats -- --save out` writes `out/project-stats.{json,md}`.
Coverage overlay: `npm run test:coverage:lcov` then
`node scripts/project-stats.ts --coverage coverage/lcov.info`.

CI on `main` appends to `stats/history.jsonl` and updates `stats/trend.md`
(committed by github-actions). Local: `node scripts/project-stats.ts --json > stats/latest.json`
then `npm run stats:history -- append` / `npm run stats:trend`.

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

Finding: `{ severity: "error"|"warning", category: "okf"|"diagram"|"heading"|"image"|"link"|"table"|"date"|"revision"|"faq"|"glossary", message, where?, instancePath? }`

## When changing validation

1. Update `packages/core/src/validate-site.ts`
2. Add tests in `tests/validate-json.test.ts`
3. Update `template/site/AGENTS.md` JSON example if shape changes
4. Update `website/content/cli.md`

## Do not

- Break `AGENTS.md` / skill parity (content agents depend on validate JSON contract)
- Publish npm packages without running full test suite