import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";
import { runSoraneAstroTsBackend } from "./backend-ts.ts";
import { runSoraneAstroCliBackend, soraneAstroCliAvailable } from "./backend-cli.ts";
import { runSoraneAstroWasmBackend, soraneAstroWasmAvailable } from "./backend-wasm.ts";
import type { AstroLogger } from "./options.ts";

export type SoraneAstroBackend = "auto" | "ts" | "wasm" | "cli";
export type ResolvedSoraneAstroBackend = "ts" | "wasm" | "cli";

/** Native Rust CLI is built and not opted out via `SORANE_ASTRO_BACKEND_NATIVE=0`. */
export function soraneAstroNativeCliEnabled(): boolean {
  return process.env.SORANE_ASTRO_BACKEND_NATIVE !== "0";
}

function nativeCliResolvable(root?: string): boolean {
  return soraneAstroNativeCliEnabled() && soraneAstroCliAvailable(root);
}

/** Resolve the active artifact backend. `auto` prefers CLI when built. */
export function resolveSoraneAstroBackend(
  backend: SoraneAstroBackend | undefined,
  logger?: AstroLogger,
  root?: string,
): ResolvedSoraneAstroBackend {
  const requested = backend ?? "auto";
  if (requested === "cli") {
    if (nativeCliResolvable(root)) return "cli";
    if (!soraneAstroNativeCliEnabled()) {
      logger?.warn?.(
        "[sorane/astro] native backend disabled (SORANE_ASTRO_BACKEND_NATIVE=0); using TypeScript",
      );
    } else {
      logger?.warn?.("[sorane/astro] backend \"cli\" requested but binary not found; using TypeScript");
    }
    return "ts";
  }
  if (requested === "ts") return "ts";
  if (requested === "wasm") {
    if (soraneAstroWasmAvailable()) return "wasm";
    logger?.warn?.(
      "[sorane/astro] backend \"wasm\" requested but @sorane/astro-backend-wasm is unavailable; using TypeScript",
    );
    return "ts";
  }
  if (requested === "auto") {
    if (nativeCliResolvable(root)) return "cli";
    if (soraneAstroWasmAvailable()) return "wasm";
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