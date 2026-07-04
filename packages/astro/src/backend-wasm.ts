import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";

const require = createRequire(import.meta.url);

function wasmArtifactPath(): string | null {
  let pkgEntry: string;
  try {
    pkgEntry = require.resolve("@sorane/astro-backend-wasm");
  } catch {
    return null;
  }
  const wasmFile = join(dirname(pkgEntry), "../wasm/sorane_astro_backend_bg.wasm");
  return existsSync(wasmFile) ? wasmFile : null;
}

/** True when `@sorane/astro-backend-wasm` is installed with built artifacts. */
export function soraneAstroWasmAvailable(): boolean {
  return wasmArtifactPath() !== null;
}

/** Run the WASM JSON contract backend (`@sorane/astro-backend-wasm`). */
export async function runSoraneAstroWasmBackend(
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  if (!soraneAstroWasmAvailable()) {
    throw new Error(
      '[sorane/astro] WASM backend unavailable; install @sorane/astro-backend-wasm or use backend "auto" | "cli" | "ts"',
    );
  }
  const { runSoraneAstroWasmBackendJson } = (await import(
    "@sorane/astro-backend-wasm"
  )) as {
    runSoraneAstroWasmBackendJson: (json: string) => string;
  };
  const outputJson = runSoraneAstroWasmBackendJson(JSON.stringify(input));
  return JSON.parse(outputJson) as SoraneAstroBackendOutput;
}