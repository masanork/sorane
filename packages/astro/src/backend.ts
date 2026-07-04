import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";
import { runSoraneAstroTsBackend } from "./backend-ts.ts";
import { runSoraneAstroCliBackend, soraneAstroCliAvailable } from "./backend-cli.ts";
import { runSoraneAstroWasmBackend, soraneAstroWasmAvailable } from "./backend-wasm.ts";
import type { AstroLogger } from "./options.ts";

export type SoraneAstroBackend = "auto" | "ts" | "wasm" | "cli";
export type ResolvedSoraneAstroBackend = "ts" | "wasm" | "cli";

/** Resolve the active artifact backend. `auto` prefers CLI when built. */
export function resolveSoraneAstroBackend(
  backend: SoraneAstroBackend | undefined,
  logger?: AstroLogger,
  root?: string,
): ResolvedSoraneAstroBackend {
  const requested = backend ?? "auto";
  if (requested === "cli") {
    if (soraneAstroCliAvailable(root)) return "cli";
    logger?.warn?.("[sorane/astro] backend \"cli\" requested but binary not found; using TypeScript");
    return "ts";
  }
  if (requested === "ts") return "ts";
  if (requested === "wasm") {
    if (soraneAstroWasmAvailable()) return "wasm";
    logger?.warn?.("[sorane/astro] backend \"wasm\" is not published yet; using TypeScript");
    return "ts";
  }
  if (requested === "auto") {
    if (soraneAstroCliAvailable(root)) return "cli";
    return "ts";
  }
  return "ts";
}

export async function runSoraneAstroBackend(
  resolved: ResolvedSoraneAstroBackend,
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  switch (resolved) {
    case "cli":
      return runSoraneAstroCliBackend(input);
    case "ts":
      return runSoraneAstroTsBackend(input);
    case "wasm":
      return runSoraneAstroWasmBackend(input);
    default:
      throw new Error(`[sorane/astro] unsupported backend: ${resolved}`);
  }
}