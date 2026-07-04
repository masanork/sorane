import { soraneAstroNativeCliEnabled } from "./backend.ts";
import { resolveSoraneAstroCliBinary, runSoraneAstroCliBackend } from "./backend-cli.ts";
import { runSoraneAstroTsBackend } from "./backend-ts.ts";
import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";

/** Resolve artifact backend for `bin/sorane-astro-backend` (Rust when built, else TS). */
export function resolveAstroBackendBinBackend(
  root: string,
): "cli" | "ts" {
  if (soraneAstroNativeCliEnabled() && resolveSoraneAstroCliBinary(root) !== null) {
    return "cli";
  }
  return "ts";
}

/** stdin/stdout JSON entry used by the npm `sorane-astro-backend` bin. */
export async function runSoraneAstroBackendBin(
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  if (resolveAstroBackendBinBackend(input.root) === "cli") {
    return runSoraneAstroCliBackend(input);
  }
  return runSoraneAstroTsBackend(input);
}