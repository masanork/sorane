#!/usr/bin/env node
/**
 * Batch embedding bridge for the native sorane-astro-backend hybrid indexer.
 * Reads JSON from stdin: { modelRoot, modelId, texts: string[] }
 * Writes JSON to stdout: { vectors: number[][], modelId, dim, quant, modelSha256 }
 */
import { readFileSync } from "node:fs";

const payload = JSON.parse(readFileSync(0, "utf8"));
const { RuriEmbeddings, DOC_PREFIX } = await import("../src/embeddings.ts");

const modelRoot = payload.modelRoot ?? "vendor/models";
const modelId = payload.modelId ?? "ruri-v3-30m";
const texts = Array.isArray(payload.texts) ? payload.texts : [];

const embeddings = new RuriEmbeddings({ modelRoot, modelId });
const vectors = await embeddings.embedBatch(texts.map((t) => DOC_PREFIX + t));

process.stdout.write(
  JSON.stringify({
    vectors,
    modelId: embeddings.modelId,
    dim: embeddings.dimensions,
    quant: embeddings.quant,
    modelSha256: embeddings.modelSha256,
  }),
);