import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";

function repoRootFromModule(): string {
  return resolve(import.meta.dirname, "../../..");
}

/** Resolve the native `sorane-astro-backend` CLI binary, if installed/built. */
export function resolveSoraneAstroCliBinary(root?: string): string | null {
  const env = process.env.SORANE_ASTRO_BACKEND_CLI;
  if (env && existsSync(env)) return env;

  const candidates = [
    resolve(repoRootFromModule(), "rust/sorane-astro-backend/target/release/sorane-astro-backend"),
    resolve(repoRootFromModule(), "rust/sorane-astro-backend/target/debug/sorane-astro-backend"),
    resolve(root ?? process.cwd(), "rust/sorane-astro-backend/target/release/sorane-astro-backend"),
    resolve(root ?? process.cwd(), "rust/sorane-astro-backend/target/debug/sorane-astro-backend"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function soraneAstroCliAvailable(root?: string): boolean {
  return resolveSoraneAstroCliBinary(root) !== null;
}

export function runSoraneAstroCliBackend(
  input: SoraneAstroBackendInput,
): SoraneAstroBackendOutput {
  const binary = resolveSoraneAstroCliBinary(input.root);
  if (!binary) {
    throw new Error(
      "[sorane/astro] sorane-astro-backend CLI not found (build rust/sorane-astro-backend or set SORANE_ASTRO_BACKEND_CLI)",
    );
  }

  const result = spawnSync(binary, [], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "[sorane/astro] sorane-astro-backend CLI failed");
  }
  return JSON.parse(result.stdout) as SoraneAstroBackendOutput;
}