import {
  NATIVE_BACKEND_SCHEMA_VERSION,
  resolveNativeBackendBinary,
  spawnNativeSubcommand,
} from "./native-cli.ts";

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

/** True when the native index subcommand can run (`sorane-astro-backend index`). */
export function soraneNativeIndexAvailable(cwd: string): boolean {
  if (process.env.SORANE_INDEX_NATIVE === "0") return false;
  return resolveNativeBackendBinary(cwd) !== null;
}

/** Build `.sorane/index.db` via `sorane-astro-backend index` (Rust ONNX when hybrid). */
export function runNativeSearchIndex(
  input: NativeSearchIndexInput,
): NativeSearchIndexOutput {
  const binary = resolveNativeBackendBinary(input.root);
  if (!binary) {
    throw new Error(
      "sorane-astro-backend native CLI not built (cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml)",
    );
  }

  const { stdout } = spawnNativeSubcommand(binary, "index", {
    schema_version: NATIVE_BACKEND_SCHEMA_VERSION,
    root: input.root,
    contentDir: input.contentDir,
    indexPath: input.indexPath,
    force: input.force ?? false,
    hybrid: input.hybrid ?? false,
    modelRoot: input.modelRoot ?? "vendor/models",
    modelId: input.modelId ?? "ruri-v3-30m",
  });

  return JSON.parse(stdout) as NativeSearchIndexOutput;
}