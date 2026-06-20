import { existsSync, writeFileSync } from "node:fs";
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
): Promise<DeriveResult> {
  if (!existsSync(dbPath)) return { written: false, chunks: 0, bytes: 0 };
  const { IndexStore } = await import("./store.ts");
  const store = new IndexStore(dbPath);
  try {
    const counts = store.counts();
    if (counts.chunks === 0) return { written: false, chunks: 0, bytes: 0 };

    if (mode === "hybrid" && store.hasVectors()) {
      const { rows, vectors } = store.exportAll();
      const meta = store.readMeta();
      const index = buildWebIndex(rows, vectors, meta, sourceToUrl);
      const json = JSON.stringify(index);
      writeFileSync(outPath, json, "utf8");
      return { written: true, chunks: index.chunks.length, bytes: json.length, mode: "hybrid" };
    }

    const { rows } = store.exportAll();
    const index = buildFtsWebIndex(rows, sourceToUrl);
    const json = JSON.stringify(index);
    writeFileSync(outPath, json, "utf8");
    return { written: true, chunks: index.chunks.length, bytes: json.length, mode: "fts" };
  } finally {
    store.close();
  }
}