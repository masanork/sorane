import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const NATIVE_BACKEND_SCHEMA_VERSION = 1;

function repoRootFromModule(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** Resolve `sorane-astro-backend` binary (debug or release). */
export function resolveNativeBackendBinary(cwd: string): string | null {
  const env =
    process.env.SORANE_ASTRO_BACKEND_CLI ??
    process.env.SORANE_INDEX_NATIVE_CLI ??
    process.env.SORANE_EMBED_NATIVE_CLI;
  if (env && existsSync(env)) return env;

  const candidates = [
    resolve(repoRootFromModule(), "rust/sorane-astro-backend/target/release/sorane-astro-backend"),
    resolve(repoRootFromModule(), "rust/sorane-astro-backend/target/debug/sorane-astro-backend"),
    resolve(cwd, "rust/sorane-astro-backend/target/release/sorane-astro-backend"),
    resolve(cwd, "rust/sorane-astro-backend/target/debug/sorane-astro-backend"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** True when ruri ONNX + tokenizer are present (matches native `model_available`). */
export function nativeHybridModelAvailable(modelRoot: string, modelId: string): boolean {
  const dir = join(modelRoot, modelId);
  return (
    existsSync(join(dir, "onnx/model_quantized.onnx")) &&
    existsSync(join(dir, "tokenizer.json"))
  );
}

export function spawnNativeSubcommand(
  binary: string,
  subcommand: string,
  payload: unknown,
): { stdout: string; stderr: string } {
  const result = spawnSync(binary, [subcommand], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `[sorane] native ${subcommand} failed`);
  }

  return { stdout: result.stdout, stderr: result.stderr };
}