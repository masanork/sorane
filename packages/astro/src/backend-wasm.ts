import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";

const WASM_UNAVAILABLE =
  "[sorane/astro] WASM backend is not published yet; use backend \"auto\" or \"cli\"";

/** Placeholder until a `@sorane/astro-backend-wasm` artifact ships. */
export async function runSoraneAstroWasmBackend(
  _input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  throw new Error(WASM_UNAVAILABLE);
}

export function soraneAstroWasmAvailable(): boolean {
  return false;
}