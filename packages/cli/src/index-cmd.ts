import { resolve } from "node:path";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";
import { loadSearchModule } from "./load-search.ts";

export async function runIndexCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const get = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : def;
  };
  const outFlag = argv.indexOf("--out");
  const indexPath = outFlag >= 0 && argv[outFlag + 1]
    ? resolve(cwd, argv[outFlag + 1]!)
    : resolve(cwd, config.search.index);
  const { buildSearchIndex } = await loadSearchModule(cwd, "index", argv);
  const result = await buildSearchIndex({
    contentDir: resolve(cwd, config.build.content_dir),
    indexPath,
    force: argv.includes("--force"),
    includeDrafts: argv.includes("--drafts"),
    onProgress: (message) => process.stdout.write(`[sorane] ${message}\n`),
  });
  process.stdout.write(
    `[sorane] indexed ${result.chunks} chunk(s) [fts] → ${indexPath}\n` +
      `  added=${result.added} changed=${result.changed} removed=${result.removed} unchanged=${result.unchanged}\n`,
  );
}
