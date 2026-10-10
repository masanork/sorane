import { createHash } from "node:crypto";

import { MAX_FILES, MAX_FILE_BYTES, MAX_SOURCE_BYTES, safePath } from './source-limits.ts';
export { MAX_FILES, MAX_FILE_BYTES, MAX_SOURCE_BYTES, safePath } from './source-limits.ts';
const OID = /^[0-9a-f]{40}$/;
export function sha256(data: string | Uint8Array): string { return createHash("sha256").update(data).digest("hex"); }
export type Source = { repositoryId: string; treeHash: string; committedAt: number; files: { path: string; bytes: Uint8Array }[] };

/** Read immutable Git objects; no repository token is minted or released. */
export async function readSource(artifacts: Artifacts, repository: string, commit: string, expectedId?:string|null): Promise<Source> {
  if (!OID.test(commit)) throw new Error("artifacts_requires_sha1_commit");
  using repo = await artifacts.get(repository);
  const info = await repo.info(), metadata = await repo.readCommit(commit);
  if (info.name !== repository || !info.id || (expectedId && info.id!==expectedId)) throw new Error("repository_identity_mismatch");
  if (!metadata || metadata.hash !== commit || !OID.test(metadata.treeHash)) throw new Error("commit_not_found");
  const files: Source["files"] = [];
  let bytes = 0, entries = 0;
  async function visit(tree: string, prefix: string, depth: number): Promise<void> {
    if (depth > 16) throw new Error("source_depth_limit");
    const children = await repo.readTree(tree);
    if (!children) throw new Error("tree_not_found");
    if (children.length > 256) throw new Error("invalid_source_tree");
    const names = new Set<string>();
    for (const entry of children) {
      if (++entries > 256 || names.has(entry.name) || entry.name.includes("/") || !safePath(entry.name) || !OID.test(entry.hash))
        throw new Error("invalid_source_tree");
      names.add(entry.name);
    }
    const treeBytes = Buffer.concat([...children].sort((a,b) => Buffer.compare(
      Buffer.from(a.name + (a.type === "tree" ? "/" : "\0")),
      Buffer.from(b.name + (b.type === "tree" ? "/" : "\0")),
    )).map((entry) => Buffer.concat([
      Buffer.from(`${entry.mode === "040000" ? "40000" : entry.mode} ${entry.name}\0`), Buffer.from(entry.hash,"hex"),
    ])));
    if (createHash("sha1").update(`tree ${treeBytes.length}\0`).update(treeBytes).digest("hex") !== tree)
      throw new Error("tree_hash_mismatch");
    for (const entry of children) {
      const path = prefix + entry.name;
      if (!safePath(path)) throw new Error("invalid_source_path");
      if (entry.type === "tree" && ["40000", "040000"].includes(entry.mode)) {
        await visit(entry.hash, path + "/", depth + 1);
      } else if (["blob", "exec"].includes(entry.type) && ["100644", "100755"].includes(entry.mode)) {
        if (files.length >= MAX_FILES) throw new Error("source_file_limit");
        const blob = await repo.readBlob(entry.hash);
        if (!blob || blob.size > MAX_FILE_BYTES || bytes + blob.size > MAX_SOURCE_BYTES) throw new Error("source_size_limit");
        const data = new Uint8Array(await blob.arrayBuffer());
        if (createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex") !== entry.hash)
          throw new Error("blob_hash_mismatch");
        bytes += data.length; files.push({ path, bytes: data });
      } else throw new Error("source_symlink_or_submodule");
    }
  }
  await visit(metadata.treeHash, "", 0);
  return { repositoryId: info.id, treeHash: metadata.treeHash, committedAt: metadata.committedAt,
    files: files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
}
