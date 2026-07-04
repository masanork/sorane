import { isOptionalModuleMissing, warnOptionalPackageMissing } from "@sorane/core";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AstroLogger } from "./options.ts";

export type SoraneAstroSearchMode = "fts" | "hybrid";

export interface SoraneAstroSearchConfig {
  /** SQLite index path relative to the Astro project root. Default: `.sorane/index.db`. */
  readonly indexPath?: string;
  /** Rebuild the index from scratch. Default: false (incremental). */
  readonly force?: boolean;
  /** FTS-only or hybrid vector search. Default: `fts`. */
  readonly mode?: SoraneAstroSearchMode;
  readonly modelRoot?: string;
  readonly modelId?: string;
}

export interface EmitAstroSearchOptions {
  readonly root: string;
  readonly contentDir: string;
  readonly outDir: string;
  readonly sourceToUrl: (source: string) => string;
  readonly search?: SoraneAstroSearchConfig;
  readonly logger?: AstroLogger;
}

export async function emitAstroSearchAssets(
  options: EmitAstroSearchOptions,
): Promise<readonly string[]> {
  const logger = options.logger;
  const log = (message: string) => logger?.info?.(`[sorane/astro] ${message}`);

  try {
    const { buildSearchIndex, emitSearchAssets, RuriEmbeddings } = await import(
      "@sorane/search"
    );
    const search = options.search;
    const indexPath = resolve(options.root, search?.indexPath ?? ".sorane/index.db");
    mkdirSync(dirname(indexPath), { recursive: true });

    const mode = search?.mode ?? "fts";
    const modelRoot = resolve(options.root, search?.modelRoot ?? "vendor/models");
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
      contentDir: options.contentDir,
      indexPath,
      force: search?.force ?? false,
      embeddings,
      onProgress: log,
    });

    const result = await emitSearchAssets({
      cwd: options.root,
      outDir: options.outDir,
      indexPath,
      mode: embeddings ? "hybrid" : "fts",
      modelRoot: search?.modelRoot ?? "vendor/models",
      modelId,
      contentDir: options.contentDir,
      sourceToUrl: options.sourceToUrl,
      onProgress: log,
    });

    const files: string[] = [];
    if (result.written) files.push("assets/search-index.json");
    if (existsSync(resolve(options.outDir, "assets", "search.mjs"))) {
      files.push("assets/search.mjs");
    }
    return files;
  } catch (err) {
    if (isOptionalModuleMissing(err)) {
      warnOptionalPackageMissing(
        { packageName: "@sorane/search", feature: "Astro search assets" },
        options.root,
      );
      logger?.warn?.("[sorane/astro] skipping search assets");
      return [];
    }
    throw err;
  }
}