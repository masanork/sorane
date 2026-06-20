import { createGzip } from "node:zlib";
import type { OkfConcept } from "./normalize.ts";
import { conceptToOkfMarkdown } from "./serialize.ts";

export interface BundleEntry {
  readonly path: string;
  readonly content: string;
}

export interface BundleConcept {
  readonly concept: OkfConcept;
  readonly slug: string;
}

/** 公開 concept を OKF bundle エントリに変換する（{type}/{slug}.md）。 */
export function buildBundleEntries(concepts: readonly BundleConcept[]): BundleEntry[] {
  return concepts
    .slice()
    .sort((a, b) => {
      const pa = `${a.concept.type}/${a.slug}`;
      const pb = `${b.concept.type}/${b.slug}`;
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    })
    .map((c) => ({
      path: `${c.concept.type}/${c.slug}.md`,
      content: conceptToOkfMarkdown(c.concept),
    }));
}

/** 最小 tar（USTAR）を組み立てる。 */
function tarEntries(entries: readonly BundleEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content, "utf8");
    const name = entry.path;
    const header = Buffer.alloc(512, 0);
    header.write(name.slice(0, 100), 0, "ascii");
    header.write("0000644\0", 100, "ascii");
    header.write("0000000\0", 108, "ascii");
    header.write("0000000\0", 116, "ascii");
    header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, "ascii");
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, "ascii");
    header.write("        ", 148, "ascii");
    header.write("ustar\0", 257, "ascii");
    header.write("00", 263, "ascii");
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i]!;
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    blocks.push(header, content);
    const pad = (512 - (content.length % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad, 0));
  }
  blocks.push(Buffer.alloc(512, 0));
  blocks.push(Buffer.alloc(512, 0));
  return Buffer.concat(blocks);
}

/** OKF bundle を gzip 圧縮した bytes として返す。 */
export function buildOkfBundle(concepts: readonly BundleConcept[]): Promise<Buffer> {
  const entries = buildBundleEntries(concepts);
  const tar = tarEntries(entries);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gzip = createGzip();
    gzip.on("data", (c) => chunks.push(c));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);
    gzip.end(tar);
  });
}