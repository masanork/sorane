import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";
import { runSoraneAstroTsBackend } from "./backend-ts.ts";
import type { AstroLogger } from "./options.ts";

export type SoraneAstroBackend = "auto" | "ts" | "wasm" | "cli";
export type ResolvedSoraneAstroBackend = "ts" | "wasm" | "cli";

/** Resolve the active artifact backend. Only `ts` is implemented today. */
export function resolveSoraneAstroBackend(
  backend: SoraneAstroBackend | undefined,
  logger?: AstroLogger,
): ResolvedSoraneAstroBackend {
  const requested = backend ?? "auto";
  if (requested === "ts" || requested === "auto") return "ts";
  logger?.warn?.(
    `[sorane/astro] backend "${requested}" is not available yet; using TypeScript`,
  );
  return "ts";
}

export async function runSoraneAstroBackend(
  resolved: ResolvedSoraneAstroBackend,
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  switch (resolved) {
    case "ts":
      return runSoraneAstroTsBackend(input);
    default:
      throw new Error(`[sorane/astro] unsupported backend: ${resolved}`);
  }
}