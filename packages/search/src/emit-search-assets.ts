import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { deriveWebIndex, type WebSearchMode } from "./derive-web-index.ts";
import { copySearchScript, vendorModel, vendorRuntime } from "./vendor-web.ts";

export interface EmitSearchAssetsOptions {
  readonly cwd: string;
  readonly outDir: string;
  readonly indexPath: string;
  readonly mode?: WebSearchMode;
  readonly modelRoot: string;
  readonly modelId: string;
  readonly bundleModel?: boolean;
  readonly assetBaseUrl?: string;
  readonly sourceToUrl: (source: string) => string;
  readonly contentDir?: string;
  readonly machineReadable?: boolean;
  readonly repoRoot?: string;
  readonly onProgress?: (message: string) => void;
}

export interface EmitSearchAssetsResult {
  readonly written: boolean;
  readonly chunks: number;
  readonly bytes: number;
  readonly mode?: WebSearchMode;
  readonly model: boolean;
  readonly runtime: boolean;
}

export async function emitSearchAssets(
  opts: EmitSearchAssetsOptions,
): Promise<EmitSearchAssetsResult> {
  const log = opts.onProgress ?? (() => {});
  const mode = opts.mode ?? "fts";
  const assetsDir = join(opts.outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  const webIdx = await deriveWebIndex(
    opts.indexPath,
    join(assetsDir, "search-index.json"),
    opts.sourceToUrl,
    mode,
    {
      contentDir: opts.contentDir,
      machineReadable: opts.machineReadable,
    },
  );

  if (!webIdx.written) {
    log(`search-index.json: skipped (no index at ${opts.indexPath})`);
    return { written: false, chunks: 0, bytes: 0, model: false, runtime: false };
  }

  const okScript = copySearchScript(opts.outDir, opts.repoRoot);
  let okModel = false;
  let okRuntime = false;

  if (mode === "hybrid") {
    const modelRoot = resolve(opts.cwd, opts.modelRoot);
    okModel = opts.bundleModel !== false && vendorModel(modelRoot, opts.modelId, opts.outDir);
    okRuntime = vendorRuntime(opts.outDir, opts.repoRoot);
    log(
      `search-index.json: ${webIdx.chunks} chunks, ${(webIdx.bytes / 1024 / 1024).toFixed(1)} MB` +
        ` [hybrid] (model=${okModel ? "ok" : "missing"}, runtime=${okRuntime ? "ok" : "missing"}, script=${okScript ? "ok" : "missing"})`,
    );
    if (opts.assetBaseUrl) {
      log(`search assets base URL: ${opts.assetBaseUrl}`);
    }
  } else {
    log(
      `search-index.json: ${webIdx.chunks} chunks, ${(webIdx.bytes / 1024).toFixed(1)} KB` +
        ` [fts] (script=${okScript ? "ok" : "missing"})`,
    );
  }

  return {
    written: true,
    chunks: webIdx.chunks,
    bytes: webIdx.bytes,
    mode: webIdx.mode,
    model: okModel,
    runtime: okRuntime,
  };
}