import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { chunkDocument } from "./chunker.ts";
import { hashContent, planIncremental } from "./incremental.ts";
import { IndexStore } from "./store.ts";
import { walkMarkdown } from "./walk.ts";

export interface BuildIndexOptions {
  readonly contentDir: string;
  readonly indexPath: string;
  readonly force?: boolean;
  readonly onProgress?: (message: string) => void;
}

export interface BuildIndexResult {
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly chunks: number;
  readonly fts: number;
}

export function buildSearchIndex(opts: BuildIndexOptions): BuildIndexResult {
  const contentDir = resolve(opts.contentDir);
  const log = opts.onProgress ?? (() => {});
  const store = new IndexStore(opts.indexPath, { fresh: opts.force === true });

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
      `removed ${plan.removed.length} / unchanged ${plan.unchanged.length} (${files.length} files)`,
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
    const chunks = chunkDocument(text, rel);
    if (chunks.length === 0) {
      store.setSourceHash(rel, sha);
      log(`[${i + 1}/${targets.length}] ${rel}: 0 chunks`);
      continue;
    }
    store.addChunks(chunks);
    store.setSourceHash(rel, sha);
    totalChunks += chunks.length;
    log(`[${i + 1}/${targets.length}] ${rel}: ${chunks.length} chunks (${totalChunks} total)`);
  }

  store.setMeta();
  const counts = store.counts();
  store.close();

  if (counts.chunks !== counts.fts) {
    throw new Error(`index mismatch: chunks=${counts.chunks} fts=${counts.fts}`);
  }

  return {
    added: plan.added.length,
    changed: plan.changed.length,
    removed: plan.removed.length,
    unchanged: plan.unchanged.length,
    chunks: counts.chunks,
    fts: counts.fts,
  };
}