#!/usr/bin/env node
import { runBuildCmd } from "./build.ts";
import { runWatchCmd } from "./watch.ts";
import { runIndexCmd } from "./index-cmd.ts";
import { runMigrateCmd } from "./migrate.ts";
import { runSearchCmd } from "./search-cmd.ts";
import { runValidateCmd } from "./validate.ts";

const [, , command, ...rest] = process.argv;

async function main(): Promise<void> {
  switch (command) {
    case "build":
      if (rest.includes("--watch")) {
        await runWatchCmd(rest.filter((a) => a !== "--watch"));
      } else {
        await runBuildCmd(rest);
      }
      break;
    case "watch":
      await runWatchCmd(rest);
      break;
    case "validate":
      await runValidateCmd(rest);
      break;
    case "migrate":
      await runMigrateCmd(rest);
      break;
    case "index":
      await runIndexCmd(rest);
      break;
    case "search":
      await runSearchCmd(rest);
      break;
    default:
      process.stderr.write(
        "usage: sorane <build|validate|migrate|index|search|watch> [options]\n" +
          "  build     --cwd <dir> [--clean] [--watch] [--skip-c2pa]\n" +
          "  watch     --cwd <dir> [--clean]\n" +
          "  validate  --cwd <dir> [--json]\n" +
          "  migrate   --cwd <dir> [--dry-run] [--bump-profile 0.2|0.3]\n" +
          "  index     --cwd <dir> [--force] [--hybrid] [--fts-only] [--out <path>] [--model <dir>] [--model-id <id>]\n" +
          "  search    <query> [--cwd <dir>] [--type article|dataset|reference|glossary|glossary-term|faq] [--tag <slug>] [--k 10] [--json] [--fts-only]\n",
      );
      process.exit(command === undefined ? 0 : 1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});