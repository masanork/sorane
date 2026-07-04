import { SORANE_ASTRO_BACKEND_SCHEMA_VERSION } from "./contract.ts";
import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";
import { buildSoraneAstroTsArtifacts } from "./backend-artifacts.ts";
import { collectBackendValidation } from "./validation.ts";

export { buildSoraneAstroTsArtifacts } from "./backend-artifacts.ts";

/**
 * TypeScript fallback/reference backend (parity tests, `backend: "ts"`, npm bin
 * when native is unavailable). Prefer `runSoraneAstroBackend` / `runSoraneAstroBackendBin`
 * for production artifact emission.
 */
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