import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";
import { runSoraneAstroTsBackend } from "./backend-ts.ts";
import { runSoraneAstroCliBackend, soraneAstroCliAvailable } from "./backend-cli.ts";
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
  if (requested === "auto") {
    // Prefer CLI only when explicitly enabled until output parity with TS is complete.
    if (
      process.env.SORANE_ASTRO_BACKEND_PREFER_CLI === "1" &&
      soraneAstroCliAvailable(root)
    ) {
      return "cli";
    }
    return "ts";
  }
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
    case "cli":
      return runSoraneAstroCliBackend(input);
    case "ts":
      return runSoraneAstroTsBackend(input);
    default:
      throw new Error(`[sorane/astro] unsupported backend: ${resolved}`);
  }
}