# sorane minimal example (monorepo)

This directory is an **in-repo** example. For a standalone content repository, use [`template/site/`](../../template/site/) instead.

## Commands (from sorane repo root)

```bash
npm run build -- --cwd examples/minimal --clean
node packages/cli/src/main.ts validate --cwd examples/minimal
node packages/cli/src/main.ts index --cwd examples/minimal --force
```

## Content rules

Same OKF frontmatter as `template/site/AGENTS.md`: `type`, `title`, `profile: sorane-okf/0.1`.

Full agent instructions: [template/site/AGENTS.md](../../template/site/AGENTS.md)