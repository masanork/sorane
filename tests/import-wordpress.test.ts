import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { parseWordPressWxrExport } from "../packages/core/src/import/adapters/wordpress.ts";
import { detectImportFormat } from "../packages/core/src/import/detect-format.ts";
import {
  collectExternalImageUrls,
  fetchImportImages,
  rewriteExternalImagesInText,
} from "../packages/core/src/import/fetch-images.ts";
import { runImport } from "../packages/core/src/import/run-import.ts";

const SAMPLE = join(import.meta.dirname, "fixtures/import/sample-wordpress.wxr.xml");
const MINIMAL = join(import.meta.dirname, "../examples/minimal");

describe("parseWordPressWxrExport", () => {
  test("sample fixture → 2 published posts", () => {
    const text = readFileSync(SAMPLE, "utf8");
    const entries = parseWordPressWxrExport(text);
    expect(entries.length).toBe(2);
    expect(entries[0]!.title).toBe("公開記事");
    expect(entries[0]!.body).toContain("WordPress body");
    expect(entries[0]!.categories).toEqual(["News"]);
    expect(entries[1]!.title).toBe("第二公開記事");
    expect(entries[1]!.categories).toEqual(["Memo"]);
  });

  test("include drafts", () => {
    const text = readFileSync(SAMPLE, "utf8");
    const entries = parseWordPressWxrExport(text, { skipDrafts: false });
    expect(entries.length).toBe(3);
    expect(entries[1]!.status).toBe("draft");
  });
});

describe("detectImportFormat wordpress", () => {
  test("sample wxr file", () => {
    const text = readFileSync(SAMPLE, "utf8");
    expect(detectImportFormat(text)).toBe("wordpress");
  });
});

describe("collectExternalImageUrls", () => {
  test("markdown and html", () => {
    const urls = collectExternalImageUrls(
      '<img src="https://a.example/x.jpg"/> ![y](https://b.example/y.png)',
    );
    expect(urls.length).toBe(2);
    expect(urls.includes("https://a.example/x.jpg")).toBe(true);
    expect(urls.includes("https://b.example/y.png")).toBe(true);
  });
});

describe("rewriteExternalImagesInText", () => {
  test("replaces all occurrences", () => {
    const out = rewriteExternalImagesInText(
      "![a](https://x.test/a.jpg) and https://x.test/a.jpg",
      { "https://x.test/a.jpg": "/images/imported/abc.jpg" },
    );
    expect(out).toBe("![a](/images/imported/abc.jpg) and /images/imported/abc.jpg");
  });
});

describe("runImport wordpress", () => {
  test("dry-run via auto format", () => {
    const result = runImport({
      cwd: MINIMAL,
      input: SAMPLE,
      format: "auto",
      dryRun: true,
    });
    expect(result.format).toBe("wordpress");
    expect(result.files.length).toBe(2);
  });

  test("writes OKF markdown to temp dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-wp-import-"));
    try {
      const result = runImport({
        cwd: dir,
        input: SAMPLE,
        format: "wordpress",
        out: "content/article",
      });
      expect(result.files.length).toBe(2);
      const first = result.files[0]!;
      expect(existsSync(first)).toBe(true);
      const md = readFileSync(first, "utf8");
      expect(md).toContain("type: article");
      expect(md).toContain("公開記事");
      expect(md).toContain("WordPress body");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("fetchImportImages", () => {
  test("mock fetch rewrites html img src", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-wp-fetch-"));
    try {
      const result = runImport({
        cwd: dir,
        input: SAMPLE,
        format: "wordpress",
        out: "content/article",
      });
      const fetchFn = async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200 });

      const fetchResult = await fetchImportImages({
        cwd: dir,
        markdownPaths: result.files,
        staticDir: "static",
        fetchFn,
      });

      expect(fetchResult.downloadedCount >= 1).toBe(true);
      expect(fetchResult.updatedFiles.length >= 1).toBe(true);

      const md = readFileSync(result.files[0]!, "utf8");
      expect(md).toContain("/images/imported/");
      expect(md.includes("https://cdn.example.com/photo.jpg")).toBe(false);

      const imagesDir = join(dir, "static/images/imported");
      expect(existsSync(imagesDir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});