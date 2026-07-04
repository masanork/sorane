import { isOptionalModuleMissing, warnOptionalPackageMissing } from "@sorane/core";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type {
  SoraneAstroBackendArtifact,
  SoraneAstroBackendInput,
} from "./contract.ts";
import type { AstroLogger } from "./options.ts";
import { htmlRelForContent } from "./routes.ts";
import type { SoraneAstroSearchConfig } from "./search.ts";

function sourceToUrl(input: SoraneAstroBackendInput, relPath: string): string {
  return htmlRelForContent(relPath, {
    permalink: input.permalink,
    collections: input.collections,
  });
}

/** Build `assets/search-index.json` as a backend artifact (index DB stays under project root). */
export async function buildSearchArtifacts(
  input: SoraneAstroBackendInput,
  logger?: AstroLogger,
): Promise<readonly SoraneAstroBackendArtifact[]> {
  const log = (message: string) => logger?.info?.(`[sorane/astro] ${message}`);

  try {
    const { buildSearchIndex, deriveWebIndex, RuriEmbeddings } = await import(
      "@sorane/search"
    );
    const search: SoraneAstroSearchConfig | undefined = input.search;
    const indexPath = resolve(input.root, search?.indexPath ?? ".sorane/index.db");
    mkdirSync(dirname(indexPath), { recursive: true });

    const mode = search?.mode ?? "fts";
    const modelRoot = resolve(input.root, search?.modelRoot ?? "vendor/models");
    const modelId = search?.modelId ?? "ruri-v3-30m";

    let embeddings = null;
    if (mode === "hybrid") {
      const modelDir = resolve(modelRoot, modelId);
      if (!existsSync(modelDir)) {
        logger?.warn?.(
          `[sorane/astro] hybrid search model not found at ${modelDir}; indexing FTS-only`,
        );
      } else {
        embeddings = new RuriEmbeddings({ modelRoot, modelId });
      }
    }

    await buildSearchIndex({
      contentDir: input.contentDir,
      indexPath,
      force: search?.force ?? false,
      embeddings,
      onProgress: log,
    });

    const tmpDir = mkdtempSync(join(tmpdir(), "sorane-search-artifact-"));
    try {
      const tmpIndex = join(tmpDir, "search-index.json");
      const webIdx = await deriveWebIndex(
        indexPath,
        tmpIndex,
        (source) => sourceToUrl(input, source),
        embeddings ? "hybrid" : "fts",
        { contentDir: input.contentDir },
      );
      if (!webIdx.written) {
        log(`search-index.json: skipped (no index at ${indexPath})`);
        return [];
      }
      const content = readFileSync(tmpIndex, "utf8");
      log(
        `search-index.json: ${webIdx.chunks} chunks, ${(webIdx.bytes / 1024).toFixed(1)} KB` +
          ` [${webIdx.mode ?? "fts"}]`,
      );
      return [{ path: "assets/search-index.json", kind: "text", content }];
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    if (isOptionalModuleMissing(err)) {
      warnOptionalPackageMissing(
        { packageName: "@sorane/search", feature: "Astro search assets" },
        input.root,
      );
      logger?.warn?.("[sorane/astro] skipping search artifacts");
      return [];
    }
    throw err;
  }
}

/** Copy search.mjs and optional hybrid runtime assets after artifacts are written. */
export async function writeSearchCompanionAssets(
  outDir: string,
  input: SoraneAstroBackendInput,
  logger?: AstroLogger,
): Promise<readonly string[]> {
  if (!input.outputs?.search) return [];
  const indexPath = join(outDir, "assets", "search-index.json");
  if (!existsSync(indexPath)) return [];

  try {
    const { copySearchScript, vendorModel, vendorRuntime } = await import("@sorane/search");
    const search = input.search;
    const mode = search?.mode ?? "fts";
    const modelRoot = resolve(input.root, search?.modelRoot ?? "vendor/models");
    const modelId = search?.modelId ?? "ruri-v3-30m";
    const files: string[] = [];

    if (copySearchScript(outDir)) files.push("assets/search.mjs");

    if (mode === "hybrid" && existsSync(resolve(modelRoot, modelId))) {
      if (vendorModel(modelRoot, modelId, outDir)) files.push(`models/${modelId}`);
      if (vendorRuntime(outDir)) files.push("assets/search/lib");
    }

    logger?.info?.(`[sorane/astro] search companion assets: ${files.join(", ") || "(none)"}`);
    return files;
  } catch (err) {
    if (isOptionalModuleMissing(err)) return [];
    throw err;
  }
}