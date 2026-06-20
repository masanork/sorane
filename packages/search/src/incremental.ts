import { createHash } from "node:crypto";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export interface IncrementalPlan {
  readonly added: string[];
  readonly changed: string[];
  readonly removed: string[];
  readonly unchanged: string[];
}

export function planIncremental(
  disk: Map<string, string>,
  indexed: Map<string, string>,
): IncrementalPlan {
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const removed: string[] = [];

  for (const [source, hash] of disk) {
    const prev = indexed.get(source);
    if (prev === undefined) added.push(source);
    else if (prev === hash) unchanged.push(source);
    else changed.push(source);
  }
  for (const source of indexed.keys()) {
    if (!disk.has(source)) removed.push(source);
  }

  const sort = (xs: string[]) => xs.sort();
  return {
    added: sort(added),
    changed: sort(changed),
    removed: sort(removed),
    unchanged: sort(unchanged),
  };
}