/**
 * sorane search — prefer OKFC site pack (U4), fall back to .sorane/index.db.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";
import { loadSearchModule } from "./load-search.ts";
import { mergeConfig } from "@sorane/core";

const SEARCH_FLAGS_WITH_VALUE = new Set([
  "--cwd",
  "--out",
  "--index",
  "--okfc",
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

export type SearchBackendKind = "okfc" | "index";

export interface ResolvedSearchBackend {
  readonly kind: SearchBackendKind;
  readonly path: string;
}

/**
 * Resolve which store to query (U4: OKFC-first).
 *
 * Priority:
 * 1. `--okfc <path>` (force OKFC)
 * 2. `--prefer-index` → index path (`--index` / `--out` / config.search.index)
 * 3. `--out` / `--index` ending in `.okfc` → OKFC
 * 4. `{out_dir}/okf/site.okfc` if present
 * 5. index path if present
 * 6. otherwise index path (caller may error if missing)
 */
export function resolveSearchBackend(
  cwd: string,
  argv: readonly string[],
  opts: {
    readonly outDir: string;
    readonly defaultIndex: string;
  },
): ResolvedSearchBackend {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : undefined;
  };

  const okfcFlag = get("--okfc");
  if (okfcFlag) {
    return { kind: "okfc", path: resolve(cwd, okfcFlag) };
  }

  const preferIndex = argv.includes("--prefer-index");
  const outOrIndex = get("--index") ?? get("--out");
  const indexPath = outOrIndex
    ? resolve(cwd, outOrIndex)
    : resolve(cwd, opts.defaultIndex);

  if (preferIndex) {
    return { kind: "index", path: indexPath };
  }

  if (outOrIndex && /\.okfc$/i.test(outOrIndex)) {
    return { kind: "okfc", path: resolve(cwd, outOrIndex) };
  }

  const siteOkfc = resolve(cwd, opts.outDir, "okf/site.okfc");
  if (existsSync(siteOkfc)) {
    return { kind: "okfc", path: siteOkfc };
  }

  return { kind: "index", path: indexPath };
}

/** @internal Exported for unit tests. */
export function parseSearchArgs(argv: string[]): {
  cwd: string;
  query: string;
  indexPath: string;
  k: number;
  docType: string;
  tag: string;
  json: boolean;
  preferIndex: boolean;
  backend: ResolvedSearchBackend;
} {
  const cwd = parseCwdFlag(argv);
  const rawConfig = loadSoraneConfig(cwd);
  const config = mergeConfig(rawConfig);
  const get = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : def;
  };
  const query = parseSearchQuery(argv);
  const outFlag = argv.indexOf("--out");
  const indexFlag = argv.indexOf("--index");
  const explicitIndex =
    indexFlag >= 0 && argv[indexFlag + 1]
      ? resolve(cwd, argv[indexFlag + 1]!)
      : outFlag >= 0 && argv[outFlag + 1]
        ? resolve(cwd, argv[outFlag + 1]!)
        : resolve(cwd, config.search.index);

  const backend = resolveSearchBackend(cwd, argv, {
    outDir: config.build.out_dir,
    defaultIndex: config.search.index,
  });

  return {
    cwd,
    query,
    indexPath: explicitIndex,
    k: Number(get("--k", "10")) || 10,
    docType: get("--type", ""),
    tag: get("--tag", ""),
    json: argv.includes("--json"),
    preferIndex: argv.includes("--prefer-index"),
    backend,
  };
}

export interface SearchCliHit {
  readonly source: string;
  readonly title: string;
  readonly score: number;
  readonly snippet: string;
  readonly headingPath: string;
  readonly headingSlug: string;
  readonly chunkIndex: number;
  readonly docType: string;
  readonly tags: string;
  readonly timestamp: string;
  readonly backend: SearchBackendKind;
  /** Concept id when backend is okfc. */
  readonly conceptId?: string;
  readonly status?: string;
}

async function searchViaOkfc(
  dbPath: string,
  query: string,
  opts: {
    readonly k: number;
    readonly docType: string;
    readonly tag: string;
    readonly cwd: string;
  },
): Promise<SearchCliHit[]> {
  const { queryOkfcFts } = await import("@sorane/okf");

  const filter = {
    limit: opts.k,
    type: opts.docType || undefined,
    tag: opts.tag || undefined,
  };

  const hits = await queryOkfcFts(dbPath, query, filter);
  return hits.map((h, rank) => ({
    source: h.id,
    title: h.title || h.id,
    score: 1 / (rank + 1),
    snippet: (h.snippet ?? h.description ?? "").replace(/\s+/g, " ").trim(),
    headingPath: h.title || h.id,
    headingSlug: "",
    chunkIndex: 0,
    docType: h.type,
    tags: "",
    timestamp: "",
    backend: "okfc" as const,
    conceptId: h.id,
    status: h.status,
  }));
}

async function searchViaIndex(
  args: ReturnType<typeof parseSearchArgs>,
  argv: string[],
): Promise<SearchCliHit[]> {
  const { IndexStore, search } =
    await loadSearchModule(args.cwd, "search", argv);

  if (!existsSync(args.backend.path)) {
    throw new Error(
      `search index not found: ${args.backend.path}\n` +
        `  run: sorane index --cwd ${args.cwd}\n` +
        `  or:  sorane build --cwd ${args.cwd}  (emits okf/site.okfc when outputs.okfc is on)`,
    );
  }

  const store = new IndexStore(args.backend.path);
  try {
    const results = search(store, args.query, {
      k: args.k,
      filter: {
        docType: args.docType || undefined,
        tag: args.tag || undefined,
      },
    });

    return results.map((row) => ({
      source: row.source,
      title: row.title || row.source,
      score: row.score,
      snippet: row.snippet,
      headingPath: row.headingPath,
      headingSlug: row.headingSlug,
      chunkIndex: row.chunkIndex,
      docType: row.docType,
      tags: row.tags,
      timestamp: row.timestamp,
      backend: "index" as const,
    }));
  } finally {
    store.close();
  }
}

export async function runSearchCmd(argv: string[]): Promise<void> {
  const args = parseSearchArgs(argv);
  if (!args.query) {
    process.stderr.write(
      "usage: sorane search <query> [--cwd <dir>] [--okfc <path>] [--prefer-index]\n" +
        "         [--type article|dataset|…] [--tag <slug>] [--k 10] [--json] [--fts-only]\n" +
        "  Prefer dist/okf/site.okfc when present (U4); else .sorane/index.db\n",
    );
    process.exit(2);
  }

  let results: SearchCliHit[];
  if (args.backend.kind === "okfc") {
    if (!existsSync(args.backend.path)) {
      process.stderr.write(
        `OKFC not found: ${args.backend.path}\n` +
          `  run: sorane build --cwd ${args.cwd}  or  sorane okfc pack --cwd ${args.cwd}\n`,
      );
      process.exit(1);
    }
    process.stderr.write(`[sorane] search backend: okfc (${args.backend.path})\n`);
    results = await searchViaOkfc(args.backend.path, args.query, {
      k: args.k,
      docType: args.docType,
      tag: args.tag,
      cwd: args.cwd,
    });
  } else {
    process.stderr.write(`[sorane] search backend: index (${args.backend.path})\n`);
    results = await searchViaIndex(args, argv);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    return;
  }

  if (results.length === 0) {
    process.stdout.write("(no results)\n");
    return;
  }

  for (const [i, row] of results.entries()) {
    const anchor =
      row.backend === "okfc"
        ? row.conceptId || row.source
        : `${row.source}#${row.headingSlug || row.chunkIndex}`;
    process.stdout.write(
      `${i + 1}. ${row.title} (${anchor}) [${row.score.toFixed(4)}]\n` +
        `   ${row.headingPath}\n` +
        `   ${row.snippet}\n\n`,
    );
  }
}
