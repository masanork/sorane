import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initSync, run_sorane_astro_backend } from "../wasm/sorane_astro_backend.js";

const wasmPath = fileURLToPath(
  new URL("../wasm/sorane_astro_backend_bg.wasm", import.meta.url),
);

/** True when the wasm-bindgen artifacts are present in this package. */
export function soraneAstroWasmArtifactAvailable(): boolean {
  return existsSync(wasmPath);
}

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  if (!soraneAstroWasmArtifactAvailable()) {
    throw new Error(
      "[sorane/astro-backend-wasm] WASM artifact missing; run npm run build:wasm -w @sorane/astro-backend-wasm",
    );
  }
  initSync(readFileSync(wasmPath));
  initialized = true;
}

/** Run the JSON contract backend via the embedded WASM module. */
export function runSoraneAstroWasmBackendJson(inputJson: string): string {
  ensureInit();
  return run_sorane_astro_backend(inputJson);
}