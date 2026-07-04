import { SORANE_ASTRO_BACKEND_SCHEMA_VERSION } from "./contract.ts";
import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";
import { buildOkfArtifacts } from "./backend-artifacts.ts";
import { isAstroOkfContent, parseBackendFiles } from "./content.ts";
import { buildSearchArtifacts } from "./search-backend.ts";
import { collectBackendValidation } from "./validation.ts";

/** TypeScript backend: deterministic OKF semantics over the JSON contract. */
export async function runSoraneAstroTsBackend(
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  const parsed = parseBackendFiles(input.files).filter(isAstroOkfContent);
  const validation = collectBackendValidation(input, input.validate ?? "warn");
  const artifacts = await buildOkfArtifacts(input, parsed);

  if (input.outputs?.search) {
    artifacts.push(...(await buildSearchArtifacts(input)));
  }

  return {
    schema_version: SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
    concepts: parsed.length,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    validationDetails: validation.details,
    artifacts,
  };
}