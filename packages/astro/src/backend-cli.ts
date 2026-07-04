import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SoraneAstroBackendInput, SoraneAstroBackendOutput } from "./contract.ts";

function repoRootFromModule(): string {
  return resolve(import.meta.dirname, "../../..");
}

function nodeCliScript(): string {
  return resolve(import.meta.dirname, "cli-main.ts");
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

export function soraneAstroNodeCliAvailable(): boolean {
  return existsSync(nodeCliScript());
}

export function soraneAstroNativeCliAvailable(root?: string): boolean {
  return nativeCliBinary(root) !== null;
}

/** Node or native JSON CLI is available. */
export function soraneAstroCliAvailable(root?: string): boolean {
  return soraneAstroNodeCliAvailable() || soraneAstroNativeCliAvailable(root);
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

/** Run the JSON contract CLI (native Rust when built; Node TS backend as fallback). */
export function runSoraneAstroCliBackend(
  input: SoraneAstroBackendInput,
): SoraneAstroBackendOutput {
  const forceNode = process.env.SORANE_ASTRO_BACKEND_NATIVE === "0";
  if (!forceNode && soraneAstroNativeCliAvailable(input.root)) {
    const binary = nativeCliBinary(input.root)!;
    return spawnCli(binary, [], input);
  }
  if (soraneAstroNodeCliAvailable()) {
    return spawnCli(process.execPath, [nodeCliScript()], input);
  }
  const binary = nativeCliBinary(input.root);
  if (binary) {
    return spawnCli(binary, [], input);
  }
  throw new Error(
    "[sorane/astro] sorane-astro-backend CLI not found (Node script missing and native binary not built)",
  );
}

export function resolveSoraneAstroCliBinary(root?: string): string | null {
  if (soraneAstroNodeCliAvailable()) return nodeCliScript();
  return nativeCliBinary(root);
}