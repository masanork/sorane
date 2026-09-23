import { writeFileSync } from "node:fs";
import { buildSourceDisclosureMap } from "./disclosure-map.ts";
import {
  buildFtsWebIndex,
  defaultSourceUrl,
  type WebExportChunk,
} from "./web-export.ts";

export interface DeriveResult {
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
  return { chunks: index.chunks.length, bytes: json.length };
}
