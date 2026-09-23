#!/usr/bin/env node
import { OptionalPackageMissingError } from "@sorane/core";
import { runBuildCmd } from "./build.ts";
import { runWatchCmd } from "./watch.ts";
import { runPreviewCmd } from "./preview.ts";
import { runMigrateCmd } from "./migrate.ts";
import { runExportCmd } from "./export.ts";
import { runImportCmd } from "./import-cmd.ts";
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
    case "preview":
      await runPreviewCmd(rest);
      break;
    case "validate":
      await runValidateCmd(rest);
      break;
    case "migrate":
      await runMigrateCmd(rest);
      break;
    case "index": {
      const { runIndexCmd } = await import("./index-cmd.ts");
      await runIndexCmd(rest);
      break;
    }
    case "search": {
      const { runSearchCmd } = await import("./search-cmd.ts");
      await runSearchCmd(rest);
      break;
    }
    case "export":
      await runExportCmd(rest);
      break;
    case "import":
      await runImportCmd(rest);
      break;
    case "okfc": {
      const { runOkfcCmd } = await import("./okfc-cmd.ts");
      await runOkfcCmd(rest);
      break;
    }
    default:
      process.stderr.write(
        "usage: sorane <build|validate|migrate|index|search|export|import|okfc|watch|preview> [options]\n" +
          "  build     --cwd <dir> [--clean] [--watch] [--skip-c2pa] [--drafts] [--preview]\n" +
          "  watch     --cwd <dir> [--clean] [--drafts] [--preview]\n" +
          "  preview   --cwd <dir> [--port 4321] [--watch]\n" +
          "  validate  --cwd <dir> [--json]\n" +
          "  migrate   --cwd <dir> [--dry-run] [--bump-profile 0.2|0.3]\n" +
          "  index     --cwd <dir> [--force] [--drafts] [--out <path>] [--yes]\n" +
          "  search    <query> [--cwd <dir>] [--okfc <path>] [--prefer-index] [--type …] [--tag <slug>] [--k 10] [--json]\n" +
          "            (prefers dist/okf/site.okfc when present; else .sorane/index.db)\n" +
          "  export    --format docx|pdf --cwd <dir> --out <file|dir> [--file <rel.md>] [--html <rel.html>]\n" +
          "  import    --input <file> --cwd <dir> [--format auto|mt|hatena-diary|wordpress] [--out content/article] [--encoding auto] [--dry-run] [--fetch-images] [--glyph-map <tsv>] [--no-normalize-html]\n" +
          "  okfc pack --cwd <dir> [--unit <id>] [--out <path>] [--drafts]\n" +
          "\n" +
          "  Optional packages (install when a command needs them):\n" +
          "    @sorane/search   index, search (index.db path)\n" +
          "    @sorane/font     fonts.enabled in sorane.yaml\n" +
          "    mermaid          build.diagrams.enabled (client mode)\n" +
          "    better-sqlite3   okfc pack / query / search via site.okfc\n",
      );
      process.exit(command === undefined ? 0 : 1);
  }
}

main().catch((err) => {
  if (err instanceof OptionalPackageMissingError) {
    process.exit(1);
  }
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
