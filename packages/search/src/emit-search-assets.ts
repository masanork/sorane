import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { deriveWebIndex } from "./derive-web-index.ts";
import { copySearchScript, vendorModel, vendorRuntime } from "./vendor-web.ts";

export interface EmitSearchAssetsOptions {
  readonly cwd: string;
  readonly outDir: string;
  readonly indexPath: string;
  readonly modelRoot: string;
  readonly modelId: string;
  readonly bundleModel?: boolean;
  readonly assetBaseUrl?: string;
  readonly sourceToUrl: (source: string) => string;
  readonly repoRoot?: string;
  readonly onProgress?: (message: string) => void;
}

export interface EmitSearchAssetsResult {
  readonly written: boolean;
  readonly chunks: number;
  readonly bytes: number;
  readonly model: boolean;
  readonly runtime: boolean;
}

export async function emitSearchAssets(
  opts: EmitSearchAssetsOptions,
): Promise<EmitSearchAssetsResult> {
  const log = opts.onProgress ?? (() => {});
  const assetsDir = join(opts.outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  const webIdx = await deriveWebIndex(
    opts.indexPath,
    join(assetsDir, "search-index.json"),
    opts.sourceToUrl,
  );

  if (!webIdx.written) {
    log("search-index.json: skipped (no hybrid index)");
    return { written: false, chunks: 0, bytes: 0, model: false, runtime: false };
  }

  const modelRoot = resolve(opts.cwd, opts.modelRoot);
  const okModel =
    opts.bundleModel !== false && vendorModel(modelRoot, opts.modelId, opts.outDir);
  const okRuntime = vendorRuntime(opts.outDir, opts.repoRoot);
  const okScript = copySearchScript(opts.outDir, opts.repoRoot);

  log(
    `search-index.json: ${webIdx.chunks} chunks, ${(webIdx.bytes / 1024 / 1024).toFixed(1)} MB` +
      ` (model=${okModel ? "ok" : "missing"}, runtime=${okRuntime ? "ok" : "missing"}, script=${okScript ? "ok" : "missing"})`,
  );

  if (opts.assetBaseUrl) {
    log(`search assets base URL: ${opts.assetBaseUrl}`);
  }

  return {
    written: true,
    chunks: webIdx.chunks,
    bytes: webIdx.bytes,
    model: okModel,
    runtime: okRuntime,
  };
}