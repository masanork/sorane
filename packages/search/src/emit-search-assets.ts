import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveWebIndexFromChunks } from "./derive-web-index.ts";
import type { WebExportChunk } from "./web-export.ts";
import { writeSearchServiceWorker } from "./offline-sw.ts";
import { copySearchScript } from "./vendor-web.ts";

export interface EmitSearchAssetsOptions {
  readonly outDir: string;
  /** Current build corpus used to generate public assets. */
  readonly chunks: readonly WebExportChunk[];
  readonly sourceToUrl: (source: string) => string;
  readonly contentDir?: string;
  readonly machineReadable?: boolean;
  readonly snippetOnly?: boolean;
  readonly metadataBySource?: ReadonlyMap<string, { lang: string; updated?: string }>;
  readonly webmcpContent?: unknown;
  readonly repoRoot?: string;
  /** Search HTML page path relative to outDir (for offline navigation fallback). */
  readonly searchPageRel?: string;
  /** Emit root `sw.js` for offline FTS (default true). */
  readonly offlineServiceWorker?: boolean;
  readonly onProgress?: (message: string) => void;
}

export interface EmitSearchAssetsResult {
  readonly chunks: number;
  readonly bytes: number;
  readonly serviceWorker: boolean;
}

export function emitSearchAssets(opts: EmitSearchAssetsOptions): EmitSearchAssetsResult {
  const log = opts.onProgress ?? (() => {});
  const assetsDir = join(opts.outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  const webIdx = deriveWebIndexFromChunks(
    opts.chunks,
    join(assetsDir, "search-index.json"),
    opts.sourceToUrl,
    {
      contentDir: opts.contentDir,
      machineReadable: opts.machineReadable,
      snippetOnly: opts.snippetOnly,
      metadataBySource: opts.metadataBySource,
    },
  );

  const okScript = copySearchScript(opts.outDir, opts.repoRoot);
  if (opts.webmcpContent) {
    writeFileSync(join(assetsDir, "webmcp-content.json"), JSON.stringify(opts.webmcpContent), "utf8");
  } else {
    // Revoking the body opt-in must also remove an earlier public export on incremental builds.
    rmSync(join(assetsDir, "webmcp-content.json"), { force: true });
  }
  log(
    `search-index.json: ${webIdx.chunks} chunks, ${(webIdx.bytes / 1024).toFixed(1)} KB` +
      ` [fts] (script=${okScript ? "ok" : "missing"})`,
  );

  let serviceWorker = false;
  if (opts.offlineServiceWorker !== false && okScript) {
    const precache = ["assets/search.mjs", "assets/webmcp.mjs", "assets/search-index.json"];
    if (opts.webmcpContent) precache.push("assets/webmcp-content.json");
    if (opts.searchPageRel) {
      precache.push(opts.searchPageRel.replace(/\\/g, "/").replace(/^\//, ""));
    }
    writeSearchServiceWorker(opts.outDir, {
      precache,
      // Updating the runtime must invalidate cached scripts even if the corpus is unchanged.
      version: precache
        .reduce((hash, path) => hash.update(readFileSync(join(opts.outDir, path))), createHash("sha256"))
        .digest("hex")
        .slice(0, 16),
    });
    serviceWorker = true;
    log(`offline search: sw.js (precache ${precache.join(", ")})`);
  }

  return {
    chunks: webIdx.chunks,
    bytes: webIdx.bytes,
    serviceWorker,
  };
}
