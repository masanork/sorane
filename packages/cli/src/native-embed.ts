import { resolve } from "node:path";
import type { EmbeddingProvider } from "@sorane/search";
import {
  NATIVE_BACKEND_SCHEMA_VERSION,
  nativeHybridModelAvailable,
  resolveNativeBackendBinary,
  spawnNativeSubcommand,
} from "./native-cli.ts";

export interface NativeEmbeddingsOptions {
  readonly root: string;
  readonly modelRoot: string;
  readonly modelId?: string;
}

interface NativeEmbedResponse {
  readonly schema_version: number;
  readonly vectors: number[][];
  readonly modelId: string;
  readonly dim: number;
  readonly quant: string;
  readonly modelSha256: string;
}

/** True when native query/document embedding can run. */
export function soraneNativeEmbedAvailable(cwd: string): boolean {
  if (process.env.SORANE_EMBED_NATIVE === "0") return false;
  return resolveNativeBackendBinary(cwd) !== null;
}

function relativeModelRoot(root: string, modelRoot: string): string {
  const absRoot = resolve(root);
  const absModel = resolve(modelRoot);
  return absModel.startsWith(absRoot)
    ? absModel.slice(absRoot.length + 1)
    : modelRoot;
}

/** ONNX embeddings via `sorane-astro-backend embed` (implements `EmbeddingProvider`). */
export class NativeEmbeddings implements EmbeddingProvider {
  readonly modelId: string;
  private readonly root: string;
  private readonly modelRoot: string;
  private cachedDim = 256;
  private cachedSha256 = "";
  private cachedQuant = "q8";

  constructor(options: NativeEmbeddingsOptions) {
    this.root = options.root;
    this.modelRoot = options.modelRoot;
    this.modelId = options.modelId ?? "ruri-v3-30m";
  }

  get dimensions(): number {
    return this.cachedDim;
  }

  get modelSha256(): string {
    return this.cachedSha256;
  }

  get quant(): string {
    return this.cachedQuant;
  }

  private runEmbed(texts: string[]): NativeEmbedResponse {
    const binary = resolveNativeBackendBinary(this.root);
    if (!binary) {
      throw new Error(
        "sorane-astro-backend native CLI not built (cargo build --manifest-path rust/sorane-astro-backend/Cargo.toml)",
      );
    }

    const { stdout } = spawnNativeSubcommand(binary, "embed", {
      schema_version: NATIVE_BACKEND_SCHEMA_VERSION,
      root: this.root,
      modelRoot: relativeModelRoot(this.root, this.modelRoot),
      modelId: this.modelId,
      texts,
    });

    const parsed = JSON.parse(stdout) as NativeEmbedResponse;
    this.cachedDim = parsed.dim;
    this.cachedSha256 = parsed.modelSha256;
    this.cachedQuant = parsed.quant;
    return parsed;
  }

  async embed(text: string): Promise<number[]> {
    const out = this.runEmbed([text]);
    if (out.vectors.length !== 1) {
      throw new Error("native embed: expected one vector");
    }
    return out.vectors[0]!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.runEmbed(texts).vectors;
  }
}

export function resolveSearchEmbeddings(
  cwd: string,
  modelRoot: string,
  modelId: string,
): EmbeddingProvider | null {
  if (soraneNativeEmbedAvailable(cwd) && nativeHybridModelAvailable(modelRoot, modelId)) {
    return new NativeEmbeddings({ root: cwd, modelRoot, modelId });
  }
  return null;
}

export { nativeHybridModelAvailable };