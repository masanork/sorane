import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;

export interface NativeSearchIndexInput {
  readonly root: string;
  readonly contentDir: string;
  readonly indexPath: string;
  readonly force?: boolean;
  readonly hybrid?: boolean;
  readonly modelRoot?: string;
  readonly modelId?: string;
}

export interface NativeSearchIndexOutput {
  readonly schema_version: number;
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly chunks: number;
  readonly fts: number;
  readonly vec: number;
  readonly mode: "hybrid" | "fts-only";
  readonly modelMissing: boolean;
}

function repoRootFromModule(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

function nativeIndexBinary(cwd: string): string | null {
  const env = process.env.SORANE_ASTRO_BACKEND_CLI ?? process.env.SORANE_INDEX_NATIVE_CLI;
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

/** True when the native index subcommand can run (`sorane-astro-backend index`). */
export function soraneNativeIndexAvailable(cwd: string): boolean {
  if (process.env.SORANE_INDEX_NATIVE === "0") return false;
  return nativeIndexBinary(cwd) !== null;
}

/** Build `.sorane/index.db` via `sorane-astro-backend index` (Rust ONNX when hybrid). */
export function runNativeSearchIndex(
  input: NativeSearchIndexInput,
): NativeSearchIndexOutput {
  const binary = nativeIndexBinary(input.root);
  if (!binary) {
    throw new Error(
      "sorane-astro-backend native CLI not built (cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml)",
    );
  }

  const payload = {
    schema_version: SCHEMA_VERSION,
    root: input.root,
    contentDir: input.contentDir,
    indexPath: input.indexPath,
    force: input.force ?? false,
    hybrid: input.hybrid ?? false,
    modelRoot: input.modelRoot ?? "vendor/models",
    modelId: input.modelId ?? "ruri-v3-30m",
  };

  const result = spawnSync(binary, ["index"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "[sorane] native index failed");
  }

  return JSON.parse(result.stdout) as NativeSearchIndexOutput;
}