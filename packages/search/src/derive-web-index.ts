import { existsSync, writeFileSync } from "node:fs";
import { buildSourceDisclosureMap } from "./disclosure-map.ts";
import {
  buildFtsWebIndex,
  defaultSourceUrl,
  type WebExportChunk,
} from "./web-export.ts";

export interface DeriveResult {
  readonly written: boolean;
  readonly chunks: number;
  readonly bytes: number;
}

export function deriveWebIndexFromChunks(
  rows: readonly WebExportChunk[],
  outPath: string,
  sourceToUrl: (source: string) => string = defaultSourceUrl,
  opts?: {
    readonly contentDir?: string;
    readonly machineReadable?: boolean;
    readonly snippetOnly?: boolean;
  },
): DeriveResult {
  const disclosureMap =
    opts?.contentDir && opts.machineReadable !== false
      ? buildSourceDisclosureMap(opts.contentDir, rows.map((r) => r.source))
      : undefined;
  const index = buildFtsWebIndex(rows, sourceToUrl, {
    disclosureMap,
    machineReadable: opts?.machineReadable,
    snippetOnly: opts?.snippetOnly,
  });
  const json = JSON.stringify(index);
  writeFileSync(outPath, json, "utf8");
  return { written: true, chunks: index.chunks.length, bytes: json.length };
}

export async function deriveWebIndex(
  dbPath: string,
  outPath: string,
  sourceToUrl: (source: string) => string = defaultSourceUrl,
  opts?: {
    readonly contentDir?: string;
    readonly machineReadable?: boolean;
    readonly snippetOnly?: boolean;
  },
): Promise<DeriveResult> {
  if (!existsSync(dbPath)) return { written: false, chunks: 0, bytes: 0 };
  const { IndexStore } = await import("./store.ts");
  const store = new IndexStore(dbPath);
  try {
    const counts = store.counts();
    if (counts.chunks === 0) return { written: false, chunks: 0, bytes: 0 };

    return deriveWebIndexFromChunks(store.exportAll(), outPath, sourceToUrl, opts);
  } finally {
    store.close();
  }
}
