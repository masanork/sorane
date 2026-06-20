import { existsSync, writeFileSync } from "node:fs";
import { buildWebIndex, defaultSourceUrl } from "./web-export.ts";

export interface DeriveResult {
  readonly written: boolean;
  readonly chunks: number;
  readonly bytes: number;
}

export async function deriveWebIndex(
  dbPath: string,
  outPath: string,
  sourceToUrl: (source: string) => string = defaultSourceUrl,
): Promise<DeriveResult> {
  if (!existsSync(dbPath)) return { written: false, chunks: 0, bytes: 0 };
  const { IndexStore } = await import("./store.ts");
  const store = new IndexStore(dbPath);
  try {
    if (!store.hasVectors()) return { written: false, chunks: 0, bytes: 0 };
    const { rows, vectors } = store.exportAll();
    const meta = store.readMeta();
    const index = buildWebIndex(rows, vectors, meta, sourceToUrl);
    const json = JSON.stringify(index);
    writeFileSync(outPath, json, "utf8");
    return { written: true, chunks: index.chunks.length, bytes: json.length };
  } finally {
    store.close();
  }
}