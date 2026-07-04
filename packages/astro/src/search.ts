import type { AstroLogger } from "./options.ts";
import { buildSearchArtifacts, writeSearchCompanionAssets } from "./search-backend.ts";
import type { SoraneAstroBackendInput } from "./contract.ts";

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

/** @deprecated Prefer backend contract `outputs.search` + `buildSearchArtifacts`. */
export async function emitAstroSearchAssets(
  options: EmitAstroSearchOptions,
): Promise<readonly string[]> {
  const input: SoraneAstroBackendInput = {
    schema_version: 1,
    root: options.root,
    contentDir: options.contentDir,
    outDir: options.outDir,
    site: { title: "", description: "" },
    files: [],
    outputs: { search: true },
    search: options.search,
    validate: false,
  };
  const artifacts = await buildSearchArtifacts(input, options.logger);
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const files: string[] = [];
  for (const artifact of artifacts) {
    const target = join(options.outDir, artifact.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, artifact.content);
    files.push(artifact.path);
  }
  files.push(...(await writeSearchCompanionAssets(options.outDir, input, options.logger)));
  return files;
}