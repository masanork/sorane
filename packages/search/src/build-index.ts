/**
 * Build `.sorane/index.db` from content markdown.
 * U2.1/U3: each document is chunked via Knowledge IR; when embeddings are
 * provided, vectors are produced per unique text (DOC_PREFIX) aligned to chunks.
 */

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  extract,
  parseYaml,
  normalizeConcept,
  buildKnowledgeIr,
  conceptIdFor,
} from "@sorane/okf";
import { chunkDocument } from "./chunker.ts";
import type { EmbeddingProvider } from "./embeddings.ts";
import { embedKnowledgeIr, vectorsAlignedToChunks } from "./embed-ir.ts";
import { hashContent, planIncremental } from "./incremental.ts";
import { IndexStore } from "./store.ts";
import { walkMarkdown } from "./walk.ts";
import { searchChunksFromKnowledgeIr } from "./from-ir.ts";

export interface BuildIndexOptions {
  readonly contentDir: string;
  readonly indexPath: string;
  readonly force?: boolean;
  readonly embeddings?: EmbeddingProvider | null;
  readonly onProgress?: (message: string) => void;
}

export interface BuildIndexResult {
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly chunks: number;
  readonly fts: number;
  readonly vec: number;
  readonly mode: "hybrid" | "fts-only";
}

export async function buildSearchIndex(opts: BuildIndexOptions): Promise<BuildIndexResult> {
  const contentDir = resolve(opts.contentDir);
  const log = opts.onProgress ?? (() => {});
  const hybrid = opts.embeddings != null;
  const store = new IndexStore(opts.indexPath, {
    fresh: opts.force === true,
    dim: hybrid ? opts.embeddings!.dimensions : 256,
  });

  const files = walkMarkdown(contentDir);
  const disk = new Map<string, string>();
  const content = new Map<string, string>();
  for (const abs of files) {
    const rel = relative(contentDir, abs).replace(/\\/g, "/");
    const text = readFileSync(abs, "utf8");
    disk.set(rel, hashContent(text));
    content.set(rel, text);
  }

  const indexed = opts.force ? new Map<string, string>() : store.sourceHashes();
  const plan = planIncremental(disk, indexed);

  log(
    `incremental: added ${plan.added.length} / changed ${plan.changed.length} / ` +
      `removed ${plan.removed.length} / unchanged ${plan.unchanged.length} (${files.length} files)` +
      (hybrid ? " [hybrid]" : " [fts-only]"),
  );

  for (const rel of plan.removed) {
    store.deleteBySource(rel);
    log(`removed ${rel}`);
  }

  const targets = [...plan.added, ...plan.changed].sort();
  let totalChunks = 0;
  for (let i = 0; i < targets.length; i++) {
    const rel = targets[i]!;
    const text = content.get(rel)!;
    const sha = disk.get(rel)!;
    store.deleteBySource(rel);

    // U3: build per-file IR → embed by text_hash → project chunks + aligned vectors
    let chunks = chunkDocument(text, rel);
    let vectors: number[][] | undefined;
    if (hybrid && chunks.length > 0) {
      const { frontmatter, body } = extract(text);
      const fm =
        frontmatter !== null && frontmatter.length > 0
          ? ((parseYaml(frontmatter) as Record<string, unknown>) ?? {})
          : {};
      const slug = rel.replace(/\\/g, "/").split("/").pop()!.replace(/\.(md|mdx)$/i, "");
      if (fm.isSystem !== true && slug !== "404") {
        const concept = normalizeConcept(fm, body, slug);
        if (concept.type) {
          const id = conceptIdFor(concept.type, slug);
          let ir = buildKnowledgeIr(
            [{ concept, slug }],
            { sourcePathByConceptId: new Map([[id, rel]]) },
          );
          ir = await embedKnowledgeIr(ir, opts.embeddings!, {
            onProgress: (m) => log(m),
          });
          chunks = searchChunksFromKnowledgeIr(ir);
          vectors = vectorsAlignedToChunks(
            ir,
            chunks.map((c) => c.text),
          );
        }
      }
    }

    if (chunks.length === 0) {
      store.setSourceHash(rel, sha);
      log(`[${i + 1}/${targets.length}] ${rel}: 0 chunks`);
      continue;
    }
    store.addChunks(chunks, vectors);
    store.setSourceHash(rel, sha);
    totalChunks += chunks.length;
    log(`[${i + 1}/${targets.length}] ${rel}: ${chunks.length} chunks (${totalChunks} total)`);
  }

  if (hybrid && opts.embeddings) {
    store.setMeta({
      modelId: opts.embeddings.modelId ?? "ruri-v3-30m",
      dim: opts.embeddings.dimensions,
      quant: opts.embeddings.quant ?? "q8",
      modelSha256: opts.embeddings.modelSha256 ?? "",
    });
  } else {
    store.setMeta();
  }

  const counts = store.counts();
  store.close();

  if (counts.chunks !== counts.fts) {
    throw new Error(`index mismatch: chunks=${counts.chunks} fts=${counts.fts}`);
  }
  if (hybrid && counts.chunks !== counts.vec) {
    throw new Error(`index mismatch: chunks=${counts.chunks} vec=${counts.vec}`);
  }

  return {
    added: plan.added.length,
    changed: plan.changed.length,
    removed: plan.removed.length,
    unchanged: plan.unchanged.length,
    chunks: counts.chunks,
    fts: counts.fts,
    vec: counts.vec,
    mode: hybrid ? "hybrid" : "fts-only",
  };
}