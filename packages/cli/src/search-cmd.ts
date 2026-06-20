import { resolve } from "node:path";
import { IndexStore, searchFts } from "@sorane/search";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

function parseSearchArgs(argv: string[]): {
  query: string;
  indexPath: string;
  k: number;
  docType: string;
  tag: string;
  json: boolean;
} {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const get = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : def;
  };
  const query = argv.find((t, i) => !t.startsWith("--") && (i === 0 || !argv[i - 1]!.startsWith("--"))) ?? "";
  const outFlag = argv.indexOf("--out");
  const indexPath =
    outFlag >= 0 && argv[outFlag + 1]
      ? resolve(cwd, argv[outFlag + 1]!)
      : resolve(cwd, config.search.index);
  return {
    query,
    indexPath,
    k: Number(get("--k", "10")) || 10,
    docType: get("--type", ""),
    tag: get("--tag", ""),
    json: argv.includes("--json"),
  };
}

export async function runSearchCmd(argv: string[]): Promise<void> {
  const args = parseSearchArgs(argv);
  if (!args.query) {
    process.stderr.write(
      "usage: sorane search <query> [--cwd <dir>] [--type article] [--tag <slug>] [--k 10] [--json]\n",
    );
    process.exit(2);
  }

  const store = new IndexStore(args.indexPath);
  const results = searchFts(store, args.query, {
    k: args.k,
    filter: {
      docType: args.docType || undefined,
      tag: args.tag || undefined,
    },
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
      `${i + 1}. ${row.title || row.source} (${row.source}#${row.headingSlug || row.chunkIndex})\n` +
        `   ${row.headingPath}\n` +
        `   ${row.snippet}\n\n`,
    );
  }
}