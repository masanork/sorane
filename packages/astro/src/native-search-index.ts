import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSoraneAstroCliBinary } from "./backend-cli.ts";

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

/** True when ruri ONNX + tokenizer are present (matches native `model_available`). */
export function nativeHybridModelAvailable(modelRoot: string, modelId: string): boolean {
  const dir = join(modelRoot, modelId);
  return (
    existsSync(join(dir, "onnx/model_quantized.onnx")) &&
    existsSync(join(dir, "tokenizer.json"))
  );
}

function relativeModelRoot(root: string, modelRoot: string): string {
  const absRoot = resolve(root);
  const absModel = resolve(modelRoot);
  return absModel.startsWith(absRoot) ? absModel.slice(absRoot.length + 1) : modelRoot;
}

/** True when the native index subcommand can run (`sorane-astro-backend index`). */
export function soraneAstroNativeIndexAvailable(root: string): boolean {
  if (process.env.SORANE_INDEX_NATIVE === "0") return false;
  return resolveSoraneAstroCliBinary(root) !== null;
}

/** Build `.sorane/index.db` via `sorane-astro-backend index` (Rust ONNX when hybrid). */
export function runNativeSearchIndex(
  input: NativeSearchIndexInput,
  onStderr?: (text: string) => void,
): NativeSearchIndexOutput {
  const binary = resolveSoraneAstroCliBinary(input.root);
  if (!binary) {
    throw new Error(
      "[sorane/astro] sorane-astro-backend native CLI not built (cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml)",
    );
  }

  const modelRootAbs = resolve(input.root, input.modelRoot ?? "vendor/models");
  const payload = {
    schema_version: SCHEMA_VERSION,
    root: input.root,
    contentDir: input.contentDir,
    indexPath: input.indexPath,
    force: input.force ?? false,
    hybrid: input.hybrid ?? false,
    modelRoot: relativeModelRoot(input.root, modelRootAbs),
    modelId: input.modelId ?? "ruri-v3-30m",
  };

  const result = spawnSync(binary, ["index"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.stderr) onStderr?.(result.stderr);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "[sorane/astro] native index failed");
  }

  return JSON.parse(result.stdout) as NativeSearchIndexOutput;
}