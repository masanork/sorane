import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { buildSearchIndex, chunkDocument, IndexStore, searchFts } from "../packages/search/src/index.ts";

function writeSite(dir: string, extra: string): void {
  mkdirSync(join(dir, "content"), { recursive: true });
  writeFileSync(
    join(dir, "sorane.yaml"),
    `site:
  title: T
  description: D
  base_url: https://ex.dev
  lang: ja
build:
  content_dir: content
  out_dir: dist
  permalink: "{{slug}}.html"
`,
    "utf8",
  );
  writeFileSync(join(dir, "content", "index.md"), "---\ntype: index\ntitle: Home\n---\n\nHi.\n", "utf8");
  writeFileSync(join(dir, "content", "draft-post.md"), extra, "utf8");
}

/** runBuild does not load sorane.yaml — pass full outputs via mergeConfig. */
function okfSiteConfig(): Partial<SoraneConfig> {
  return mergeConfig({
    site: { title: "T", description: "D", base_url: "https://ex.dev", lang: "ja" },
    build: {
      content_dir: "content",
      out_dir: "dist",
      permalink: "{{slug}}.html",
      outputs: {
        md_alternate: true,
        okf_bundle: true,
        okfc: false,
        catalog: true,
        llms_txt: true,
        feed: true,
        sitemap: true,
        robots: true,
      },
    },
  } as Partial<SoraneConfig>);
}

const DRAFT_MD = `---
type: article
title: Secret
draft: true
profile: sorane-okf/0.1
---

Draft body for unpublished work with enough text to form a search chunk.
`;

function tarNames(gz: Buffer): string[] {
  const tar = gunzipSync(gz);
  const names: string[] = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeOctal || "0", 8) || 0;
    if (name) names.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

describe("build draft pages", () => {
  test("本番ビルドでは draft を除外", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-draft-"));
    try {
      writeSite(dir, DRAFT_MD);
      await runBuild({ cwd: dir, config: {} });
      expect(existsSync(join(dir, "dist", "draft-post.html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("本番ビルドでは draft を OKF bundle / catalog / sitemap から除外", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-draft-bundle-"));
    try {
      writeSite(dir, DRAFT_MD);
      writeFileSync(
        join(dir, "content", "pub.md"),
        "---\ntype: article\ntitle: Public\nprofile: sorane-okf/0.1\n---\n\nPublished page with enough text for lists.\n",
        "utf8",
      );
      await runBuild({ cwd: dir, config: okfSiteConfig() });

      expect(existsSync(join(dir, "dist", "draft-post.html"))).toBe(false);
      expect(existsSync(join(dir, "dist", "pub.html"))).toBe(true);

      const bundlePath = join(dir, "dist", "okf", "bundle.tar.gz");
      expect(existsSync(bundlePath)).toBe(true);
      const names = tarNames(readFileSync(bundlePath));
      expect(names.some((n) => n.includes("draft-post") || n.includes("Secret"))).toBe(false);
      expect(names.some((n) => n.includes("pub") || n.endsWith("pub.md"))).toBe(true);

      const catalog = readFileSync(join(dir, "dist", "catalog.jsonld"), "utf8");
      expect(catalog.includes("Secret")).toBe(false);
      expect(catalog.includes("Public")).toBe(true);

      const sitemap = readFileSync(join(dir, "dist", "sitemap.xml"), "utf8");
      expect(sitemap.includes("draft-post")).toBe(false);
      expect(sitemap.includes("pub.html")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("includeDrafts で draft を出力", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-draft-"));
    try {
      writeSite(dir, DRAFT_MD);
      await runBuild({ cwd: dir, config: {}, includeDrafts: true, preview: true });
      const html = readFileSync(join(dir, "dist", "draft-post.html"), "utf8");
      expect(html).toContain("下書き");
      expect(html).toContain("ローカルプレビュー");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("includeDrafts で draft が OKF bundle に入る", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-draft-bundle-in-"));
    try {
      writeSite(dir, DRAFT_MD);
      await runBuild({ cwd: dir, config: okfSiteConfig(), includeDrafts: true });
      const names = tarNames(readFileSync(join(dir, "dist", "okf", "bundle.tar.gz")));
      expect(names.some((n) => n.includes("draft-post") || n.includes("article/"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("search index draft pages", () => {
  test("chunkDocument は draft を既定で除外", () => {
    expect(chunkDocument(DRAFT_MD, "draft-post.md").length).toBe(0);
    expect(chunkDocument(DRAFT_MD, "draft-post.md", { includeDrafts: true }).length > 0).toBe(true);
  });

  test("buildSearchIndex は draft を除外し includeDrafts で含める", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-draft-index-"));
    const contentDir = join(dir, "content");
    const indexPath = join(dir, "index.db");
    try {
      mkdirSync(contentDir, { recursive: true });
      writeFileSync(join(contentDir, "draft-post.md"), DRAFT_MD, "utf8");
      writeFileSync(
        join(contentDir, "pub.md"),
        `---
type: article
title: Public Search
profile: sorane-okf/0.1
---
Published article body long enough for search chunking with unique token ZXQRFT.
`,
        "utf8",
      );

      const built = await buildSearchIndex({
        contentDir,
        indexPath,
        force: true,
      });
      expect(built.chunks > 0).toBe(true);
      const store = new IndexStore(indexPath);
      const hits = searchFts(store, "ZXQRFT", { k: 5 });
      expect(hits.length > 0).toBe(true);
      expect(hits.every((h) => h.title !== "Secret")).toBe(true);
      const secret = searchFts(store, "Secret", { k: 5 });
      expect(secret.every((h) => h.title !== "Secret")).toBe(true);
      store.close();

      const withDrafts = await buildSearchIndex({
        contentDir,
        indexPath,
        force: true,
        includeDrafts: true,
      });
      expect(withDrafts.chunks >= built.chunks).toBe(true);
      const store2 = new IndexStore(indexPath);
      const draftHits = searchFts(store2, "unpublished", { k: 5 });
      expect(draftHits.some((h) => h.title === "Secret")).toBe(true);
      store2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
