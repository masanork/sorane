import { SORANE_ASTRO_BACKEND_SCHEMA_VERSION } from "./contract.ts";
import type {
  SoraneAstroBackendArtifact,
  SoraneAstroBackendInput,
  SoraneAstroBackendOutput,
} from "./contract.ts";
import { buildOkfArtifacts } from "./backend-artifacts.ts";
import { isAstroOkfContent, parseBackendFiles } from "./content.ts";
import { buildSearchArtifacts } from "./search-backend.ts";
import { collectBackendValidation } from "./validation.ts";

/** OKF artifacts only (no validation). Used by integration and parity tests. */
export async function buildSoraneAstroTsArtifacts(
  input: SoraneAstroBackendInput,
): Promise<{ concepts: number; artifacts: SoraneAstroBackendArtifact[] }> {
  const parsed = parseBackendFiles(input.files).filter(isAstroOkfContent);
  const artifacts = await buildOkfArtifacts(input, parsed);

  if (input.outputs?.search) {
    artifacts.push(...(await buildSearchArtifacts(input)));
  }

  return { concepts: parsed.length, artifacts };
}

/** TypeScript backend: deterministic OKF semantics over the JSON contract. */
export async function runSoraneAstroTsBackend(
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  const { concepts, artifacts } = await buildSoraneAstroTsArtifacts(input);
  const validation =
    input.validate === false
      ? { errors: 0, warnings: 0, details: [] as string[] }
      : collectBackendValidation(input, input.validate ?? "warn");

  return {
    schema_version: SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
    concepts,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    validationDetails: validation.details,
    artifacts,
  };
}