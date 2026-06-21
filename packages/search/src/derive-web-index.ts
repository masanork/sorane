import { existsSync, writeFileSync } from "node:fs";
import { buildSourceDisclosureMap } from "./disclosure-map.ts";
import { buildFtsWebIndex, buildWebIndex, defaultSourceUrl } from "./web-export.ts";

export type WebSearchMode = "fts" | "hybrid";

export interface DeriveResult {
  readonly written: boolean;
  readonly chunks: number;
  readonly bytes: number;
  readonly mode?: WebSearchMode;
}

export async function deriveWebIndex(
  dbPath: string,
  outPath: string,
  sourceToUrl: (source: string) => string = defaultSourceUrl,
  mode: WebSearchMode = "fts",
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

    const { rows, vectors } = store.exportAll();
    const disclosureMap =
      opts?.contentDir && opts.machineReadable !== false
        ? buildSourceDisclosureMap(
            opts.contentDir,
            rows.map((r) => r.source),
          )
        : undefined;
    const exportOpts = {
      disclosureMap,
      machineReadable: opts?.machineReadable,
      snippetOnly: opts?.snippetOnly,
    };

    if (mode === "hybrid" && store.hasVectors()) {
      const meta = store.readMeta();
      const index = buildWebIndex(rows, vectors, meta, sourceToUrl, exportOpts);
      const json = JSON.stringify(index);
      writeFileSync(outPath, json, "utf8");
      return { written: true, chunks: index.chunks.length, bytes: json.length, mode: "hybrid" };
    }

    const index = buildFtsWebIndex(rows, sourceToUrl, exportOpts);
    const json = JSON.stringify(index);
    writeFileSync(outPath, json, "utf8");
    return { written: true, chunks: index.chunks.length, bytes: json.length, mode: "fts" };
  } finally {
    store.close();
  }
}