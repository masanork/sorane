import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  contentDirExists,
  resolveAstroPaths,
} from "./collect-input.ts";
import { resolveSoraneAstroBackend, runSoraneAstroBackend } from "./backend.ts";
import { htmlRelForContent } from "./routes.ts";
import { emitAstroSearchAssets } from "./search.ts";
import { writeSoraneAstroBackendArtifacts } from "./write-artifacts.ts";
import type { SoraneAstroArtifactResult, SoraneAstroOptions } from "./options.ts";

type AstroIntegrationLike = {
  readonly name: string;
  readonly hooks: {
    readonly "astro:build:done": (args: {
      dir: URL;
      logger?: SoraneAstroOptions["logger"];
    }) => Promise<void>;
  };
};

function applyValidationPolicy(
  options: SoraneAstroOptions,
  validationErrors: number,
  validationWarnings: number,
  details: readonly string[],
): void {
  const mode = options.validate ?? "warn";
  if (mode === false || validationErrors + validationWarnings === 0) return;
  const message = `[sorane/astro] content validation found ${validationErrors} errors and ${validationWarnings} warnings\n${details.join("\n")}`;
  if (mode === "error" && validationErrors > 0) {
    throw new Error(message);
  }
  options.logger?.warn?.(message);
}

export async function emitSoraneAstroArtifacts(
  options: SoraneAstroOptions,
): Promise<SoraneAstroArtifactResult> {
  const paths = resolveAstroPaths(options);
  const logger = options.logger;
  const resolved = resolveSoraneAstroBackend(options.backend, logger);

  if (!contentDirExists(paths.contentDir)) {
    logger?.warn?.(`[sorane/astro] content directory not found: ${paths.contentDir}`);
    return { concepts: 0, files: [], validationErrors: 0, validationWarnings: 0 };
  }

  mkdirSync(paths.outDir, { recursive: true });

  const files = collectSoraneAstroBackendFiles(paths.contentDir);
  const input = buildSoraneAstroBackendInput(options, paths, files);
  const output = await runSoraneAstroBackend(resolved, input);

  applyValidationPolicy(
    options,
    output.validationErrors,
    output.validationWarnings,
    output.validationDetails,
  );

  const written = [...writeSoraneAstroBackendArtifacts(paths.outDir, output)];

  if (options.outputs?.search) {
    const searchFiles = await emitAstroSearchAssets({
      root: paths.root,
      contentDir: paths.contentDir,
      outDir: paths.outDir,
      sourceToUrl: (source) =>
        htmlRelForContent(source, {
          permalink: options.permalink,
          collections: options.collections,
        }),
      search: options.search,
      logger,
    });
    written.push(...searchFiles);
  }

  logger?.info?.(
    `[sorane/astro] emitted ${written.length} artifacts for ${output.concepts} OKF concepts`,
  );
  return {
    concepts: output.concepts,
    files: written,
    validationErrors: output.validationErrors,
    validationWarnings: output.validationWarnings,
  };
}

export default function soraneAstro(options: SoraneAstroOptions): AstroIntegrationLike {
  return {
    name: "@sorane/astro",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        await emitSoraneAstroArtifacts({
          ...options,
          outDir: options.outDir ?? fileURLToPath(dir),
          logger: options.logger ?? logger,
        });
      },
    },
  };
}

export { soraneAstro };
export {
  SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
  type SoraneAstroArtifactKind,
  type SoraneAstroBackendArtifact,
  type SoraneAstroBackendFileInput,
  type SoraneAstroBackendInput,
  type SoraneAstroBackendOutput,
  type SoraneAstroBackendOutputsInput,
  type SoraneAstroBackendSiteInput,
} from "./contract.ts";
export {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  resolveAstroPaths,
} from "./collect-input.ts";
export { runSoraneAstroTsBackend } from "./backend-ts.ts";
export { runSoraneAstroBackend, resolveSoraneAstroBackend, type ResolvedSoraneAstroBackend, type SoraneAstroBackend } from "./backend.ts";
export { decodeBackendArtifact, writeSoraneAstroBackendArtifacts } from "./write-artifacts.ts";
export { htmlRelForContent, absoluteUrl } from "./routes.ts";
export type {
  AstroLogger,
  SoraneAstroArtifactResult,
  SoraneAstroOptions,
  SoraneAstroPermalink,
  SoraneAstroSiteConfig,
  SoraneAstroValidateMode,
} from "./options.ts";
export {
  emitAstroSearchAssets,
  type SoraneAstroSearchConfig,
  type SoraneAstroSearchMode,
} from "./search.ts";