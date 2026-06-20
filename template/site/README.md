# My sorane site

Static site powered by [sorane](https://github.com/masanork/sorane). Content lives in `content/`; HTML is generated to `dist/`.

## For humans

1. Clone [masanork/sorane](https://github.com/masanork/sorane) next to this repo (or set `SORANE_ROOT`).
2. `node ../sorane/packages/cli/src/main.ts build --cwd . --clean`
3. Deploy `dist/` (e.g. Cloudflare Pages).

## For AI assistants

Open **[AGENTS.md](./AGENTS.md)** — works with Cursor, Claude Code, Antigravity, Codex, and other agents that read `AGENTS.md`.

- Cursor also loads `.cursor/rules/sorane.mdc`
- Claude Code loads `CLAUDE.md` (pointer to AGENTS.md)
- Antigravity may use `GEMINI.md`; content is still in AGENTS.md