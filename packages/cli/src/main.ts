#!/usr/bin/env node
import { runBuildCmd } from "./build.ts";
import { runIndexCmd } from "./index-cmd.ts";
import { runMigrateCmd } from "./migrate.ts";
import { runSearchCmd } from "./search-cmd.ts";
import { runValidateCmd } from "./validate.ts";

const [, , command, ...rest] = process.argv;

async function main(): Promise<void> {
  switch (command) {
    case "build":
      await runBuildCmd(rest);
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
        "usage: sorane <build|validate|migrate|index|search> [options]\n" +
          "  build     --cwd <dir> [--clean]\n" +
          "  validate  --cwd <dir>\n" +
          "  migrate   --cwd <dir> [--dry-run]\n" +
          "  index     --cwd <dir> [--force] [--hybrid] [--fts-only] [--out <path>] [--model <dir>] [--model-id <id>]\n" +
          "  search    <query> [--cwd <dir>] [--type article] [--tag <slug>] [--k 10] [--json] [--fts-only]\n",
      );
      process.exit(command === undefined ? 0 : 1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});