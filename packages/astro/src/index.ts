import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  contentDirExists,
  resolveAstroPaths,
} from "./collect-input.ts";
import { resolveSoraneAstroBackend, runSoraneAstroBackend } from "./backend.ts";
import { resolveAstroRoutePlan } from "./route-loader.ts";
import { buildSearchArtifacts, writeSearchCompanionAssets } from "./search-backend.ts";
import { writeSoraneAstroBackendArtifacts } from "./write-artifacts.ts";
import { collectBackendValidation } from "./validation.ts";
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
  const resolved = resolveSoraneAstroBackend(options.backend, logger, paths.root);

  if (!contentDirExists(paths.contentDir)) {
    logger?.warn?.(`[sorane/astro] content directory not found: ${paths.contentDir}`);
    return { concepts: 0, files: [], validationErrors: 0, validationWarnings: 0 };
  }

  mkdirSync(paths.outDir, { recursive: true });

  const routePlan = resolveAstroRoutePlan(paths.root, {
    collections: options.collections,
    permalink: options.permalink,
  });
  const files = collectSoraneAstroBackendFiles(paths.contentDir);
  const input = buildSoraneAstroBackendInput(options, paths, files, routePlan);
  const validation = collectBackendValidation(input, options.validate ?? "warn");
  // Validation policy: integration-layer TS gate only; artifact backends always validate: false
  // (design/astro-rust-backend.md — "Validation policy (Astro integration)").
  let output = await runSoraneAstroBackend(resolved, { ...input, validate: false });

  if (
    options.outputs?.search &&
    !output.artifacts.some((a) => a.path === "assets/search-index.json")
  ) {
    const searchArtifacts = await buildSearchArtifacts(
      { ...input, validate: false },
      logger,
    );
    output = { ...output, artifacts: [...output.artifacts, ...searchArtifacts] };
  }

  applyValidationPolicy(
    options,
    validation.errors,
    validation.warnings,
    validation.details,
  );

  const written = [...writeSoraneAstroBackendArtifacts(paths.outDir, output)];
  written.push(...(await writeSearchCompanionAssets(paths.outDir, input, logger)));

  logger?.info?.(
    `[sorane/astro] emitted ${written.length} artifacts for ${output.concepts} OKF concepts`,
  );
  return {
    concepts: output.concepts,
    files: written,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
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
  type SoraneAstroBackendOpenDataInput,
  type SoraneAstroBackendOutputsInput,
  type SoraneAstroBackendSiteInput,
} from "./contract.ts";
export {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  resolveAstroPaths,
} from "./collect-input.ts";
export { runSoraneAstroTsBackend } from "./backend-ts.ts";
export {
  resolveSoraneAstroCliBinary,
  runSoraneAstroCliBackend,
  soraneAstroCliAvailable,
  soraneAstroNativeCliAvailable,
} from "./backend-cli.ts";
export {
  runSoraneAstroBackend,
  resolveSoraneAstroBackend,
  soraneAstroNativeCliEnabled,
  type ResolvedSoraneAstroBackend,
  type SoraneAstroBackend,
} from "./backend.ts";
export { decodeBackendArtifact, writeSoraneAstroBackendArtifacts } from "./write-artifacts.ts";
export {
  discoverAstroCollectionRoutes,
  mergeCollectionRouteMap,
  resolveAstroRoutePlan,
  type AstroDiscoveredCollectionRoute,
  type AstroRoutePlan,
} from "./route-loader.ts";
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