import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";
import { loadSearchModule } from "./load-search.ts";

const SEARCH_FLAGS_WITH_VALUE = new Set([
  "--cwd",
  "--out",
  "--model",
  "--model-id",
  "--k",
  "--type",
  "--tag",
]);

/** @internal Exported for unit tests (positional query vs flag values). */
export function parseSearchQuery(argv: readonly string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (SEARCH_FLAGS_WITH_VALUE.has(token)) {
      i++;
      continue;
    }
    if (token.startsWith("--")) continue;
    parts.push(token);
  }
  return parts.join(" ");
}

/** @internal Exported for unit tests. */
export function parseSearchArgs(argv: string[]): {
  cwd: string;
  query: string;
  indexPath: string;
  modelRoot: string;
  modelId: string;
  k: number;
  docType: string;
  tag: string;
  json: boolean;
  ftsOnly: boolean;
} {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const get = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : def;
  };
  const query = parseSearchQuery(argv);
  const outFlag = argv.indexOf("--out");
  const indexPath =
    outFlag >= 0 && argv[outFlag + 1]
      ? resolve(cwd, argv[outFlag + 1]!)
      : resolve(cwd, config.search.index);
  return {
    cwd,
    query,
    indexPath,
    modelRoot: resolve(cwd, get("--model", config.search.model)),
    modelId: get("--model-id", config.search.model_id),
    k: Number(get("--k", "10")) || 10,
    docType: get("--type", ""),
    tag: get("--tag", ""),
    json: argv.includes("--json"),
    ftsOnly: argv.includes("--fts-only"),
  };
}

export async function runSearchCmd(argv: string[]): Promise<void> {
  const args = parseSearchArgs(argv);
  const { IndexStore, RuriEmbeddings, search, checkModelMismatch } = await loadSearchModule(
    args.cwd,
    "search",
    argv,
  );
  if (!args.query) {
    process.stderr.write(
      "usage: sorane search <query> [--cwd <dir>] [--type article|dataset|reference|glossary|glossary-term|faq] [--tag <slug>] [--k 10] [--json] [--fts-only]\n",
    );
    process.exit(2);
  }

  const store = new IndexStore(args.indexPath);
  let embeddings = null;
  if (!args.ftsOnly && store.hasVectors()) {
    const modelDir = resolve(args.modelRoot, args.modelId);
    if (!existsSync(modelDir)) {
      process.stderr.write(
        `[sorane] model not found at ${modelDir}; searching FTS-only\n`,
      );
    } else {
      embeddings = new RuriEmbeddings({
        modelRoot: args.modelRoot,
        modelId: args.modelId,
      });
      const mismatch = checkModelMismatch(
        store.readMeta(),
        args.modelId,
        embeddings.dimensions,
      );
      if (mismatch) {
        process.stderr.write(`[sorane] warning: ${mismatch}; consider re-indexing with --force\n`);
      }
    }
  }

  const results = await search(store, embeddings, args.query, {
    k: args.k,
    filter: {
      docType: args.docType || undefined,
      tag: args.tag || undefined,
    },
    ftsOnly: args.ftsOnly,
  });
  store.close();

  if (args.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    return;
  }

  if (results.length === 0) {
    process.stdout.write("(no results)\n");
    return;
  }

  for (const [i, row] of results.entries()) {
    process.stdout.write(
      `${i + 1}. ${row.title || row.source} (${row.source}#${row.headingSlug || row.chunkIndex}) [${row.score.toFixed(4)}]\n` +
        `   ${row.headingPath}\n` +
        `   ${row.snippet}\n\n`,
    );
  }
}