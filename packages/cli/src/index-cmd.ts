import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildSearchIndex, RuriEmbeddings } from "@sorane/search";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

export async function runIndexCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const force = argv.includes("--force");
  const ftsOnly = argv.includes("--fts-only");
  const get = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : def;
  };
  const outFlag = argv.indexOf("--out");
  const indexPath =
    outFlag >= 0 && argv[outFlag + 1]
      ? resolve(cwd, argv[outFlag + 1]!)
      : resolve(cwd, config.search.index);
  const contentDir = resolve(cwd, config.build.content_dir);
  const modelRoot = resolve(cwd, get("--model", config.search.model));
  const modelId = get("--model-id", config.search.model_id);

  let embeddings = null;
  if (!ftsOnly) {
    const modelDir = resolve(modelRoot, modelId);
    if (!existsSync(modelDir)) {
      process.stderr.write(
        `[sorane] model not found at ${modelDir}; indexing FTS-only\n` +
          `  run: npm run fetch-model (or sorane index --fts-only)\n`,
      );
    } else {
      embeddings = new RuriEmbeddings({ modelRoot, modelId });
    }
  }

  const result = await buildSearchIndex({
    contentDir,
    indexPath,
    force,
    embeddings,
    onProgress: (message) => process.stdout.write(`[sorane] ${message}\n`),
  });

  process.stdout.write(
    `[sorane] indexed ${result.chunks} chunk(s) [${result.mode}] → ${indexPath}\n` +
      `  added=${result.added} changed=${result.changed} removed=${result.removed} unchanged=${result.unchanged}\n` +
      (result.mode === "hybrid" ? `  vec=${result.vec}\n` : ""),
  );
}