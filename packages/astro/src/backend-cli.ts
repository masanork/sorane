import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";

function repoRootFromModule(): string {
  return resolve(import.meta.dirname, "../../..");
}

function nativeCliBinary(root?: string): string | null {
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

export function soraneAstroNativeCliAvailable(root?: string): boolean {
  return nativeCliBinary(root) !== null;
}

/** Native Rust JSON CLI is available. */
export function soraneAstroCliAvailable(root?: string): boolean {
  return soraneAstroNativeCliAvailable(root);
}

function spawnCli(command: string, args: string[], input: SoraneAstroBackendInput): SoraneAstroBackendOutput {
  const result = spawnSync(command, args, {
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

/** Run the native Rust JSON contract CLI. */
export function runSoraneAstroCliBackend(
  input: SoraneAstroBackendInput,
): SoraneAstroBackendOutput {
  if (process.env.SORANE_ASTRO_BACKEND_NATIVE === "0") {
    throw new Error(
      "[sorane/astro] native backend disabled (SORANE_ASTRO_BACKEND_NATIVE=0); use backend \"ts\"",
    );
  }
  const binary = nativeCliBinary(input.root);
  if (!binary) {
    throw new Error(
      "[sorane/astro] sorane-astro-backend native CLI not built (cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml)",
    );
  }
  return spawnCli(binary, [], input);
}

export function resolveSoraneAstroCliBinary(root?: string): string | null {
  return nativeCliBinary(root);
}