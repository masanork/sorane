import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export interface EmbeddingProvider {
  readonly dimensions: number;
  readonly modelId?: string;
  readonly modelSha256?: string;
  readonly quant?: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export const DOC_PREFIX = "検索文書: ";
export const QUERY_PREFIX = "検索クエリ: ";

export interface RuriOptions {
  readonly modelRoot?: string;
  readonly modelId?: string;
  readonly dtype?: string;
}

export class RuriEmbeddings implements EmbeddingProvider {
  readonly dimensions = 256;
  readonly modelId: string;
  readonly modelDir: string;
  private readonly dtype: string;
  private readonly modelRoot: string;
  private extractor: ((text: string, opts: object) => Promise<{ data: Float32Array | number[] }>) | null = null;

  constructor(options: RuriOptions = {}) {
    this.modelRoot = resolve(options.modelRoot ?? "vendor/models");
    this.modelId = options.modelId ?? "ruri-v3-30m";
    this.modelDir = resolve(this.modelRoot, this.modelId);
    this.dtype = options.dtype ?? "q8";
  }

  get modelSha256(): string {
    const p = resolve(this.modelDir, "version.txt");
    return existsSync(p) ? readFileSync(p, "utf8").trim() : "";
  }

  get quant(): string {
    return this.dtype;
  }

  private async ensure(): Promise<void> {
    if (this.extractor) return;
    if (!existsSync(this.modelDir)) {
      throw new Error(
        `model not found: ${this.modelDir}\n  run: npm run fetch-model`,
      );
    }
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowRemoteModels = false;
    env.localModelPath = this.modelRoot;
    env.useBrowserCache = false;
    this.extractor = (await pipeline("feature-extraction", this.modelId, {
      dtype: this.dtype as "q8",
    })) as unknown as typeof this.extractor;
  }

  async embed(text: string): Promise<number[]> {
    await this.ensure();
    const out = await this.extractor!(text, { pooling: "mean", normalize: true });
    const data = out.data;
    if (data.length !== this.dimensions) {
      throw new Error(`dimension mismatch: ${data.length} != ${this.dimensions}`);
    }
    return Array.from(data);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(await this.embed(texts[i]!));
    }
    return out;
  }
}