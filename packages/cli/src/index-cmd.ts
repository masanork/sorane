import { resolve } from "node:path";
import { buildSearchIndex } from "@sorane/search";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

export async function runIndexCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const force = argv.includes("--force");
  const outFlag = argv.indexOf("--out");
  const indexPath =
    outFlag >= 0 && argv[outFlag + 1]
      ? resolve(cwd, argv[outFlag + 1]!)
      : resolve(cwd, config.search.index);
  const contentDir = resolve(cwd, config.build.content_dir);

  const result = buildSearchIndex({
    contentDir,
    indexPath,
    force,
    onProgress: (message) => process.stdout.write(`[sorane] ${message}\n`),
  });

  process.stdout.write(
    `[sorane] indexed ${result.chunks} chunk(s) → ${indexPath}\n` +
      `  added=${result.added} changed=${result.changed} removed=${result.removed} unchanged=${result.unchanged}\n`,
  );
}