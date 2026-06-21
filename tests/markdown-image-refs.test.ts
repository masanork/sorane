import { describe, expect, test } from "./_expect.ts";
import {
  collectMarkdownImageRefs,
  extractMarkdownImagePaths,
  resolveMarkdownImageRef,
} from "../packages/core/src/markdown-image-refs.ts";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("extractMarkdownImagePaths", () => {
  test("ローカル画像パスを抽出", () => {
    const paths = extractMarkdownImagePaths('![Hero](../static/hero.png)\n![](assets/fig.png)');
    expect(paths.map((p) => p.path)).toEqual(["../static/hero.png", "assets/fig.png"]);
  });

  test("外部 URL は無視", () => {
    expect(extractMarkdownImagePaths("![](https://cdn.example/x.png)")).toEqual([]);
  });
});

describe("resolveMarkdownImageRef", () => {
  test("static 参照を解決", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-mdimg-"));
    try {
      const staticDir = join(root, "static");
      mkdirSync(staticDir, { recursive: true });
      writeFileSync(join(staticDir, "hero.png"), TINY_PNG);
      const ref = resolveMarkdownImageRef({
        markdownPath: "../static/hero.png",
        sourceMdRel: "index.md",
        outHtmlRel: "index.html",
        contentDir: join(root, "content"),
        cwd: root,
        staticDirName: "static",
      });
      expect(ref?.kind).toBe("static");
      expect(ref?.publicPath).toBe("static/hero.png");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("content 内画像を解決", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-mdimg-"));
    try {
      const contentDir = join(root, "content");
      const assetsDir = join(contentDir, "article", "assets");
      mkdirSync(assetsDir, { recursive: true });
      writeFileSync(join(assetsDir, "fig.png"), TINY_PNG);
      const ref = resolveMarkdownImageRef({
        markdownPath: "assets/fig.png",
        sourceMdRel: "article/post.md",
        outHtmlRel: "article/post.html",
        contentDir,
        cwd: root,
        staticDirName: "static",
      });
      expect(ref?.kind).toBe("content");
      expect(ref?.publicPath).toBe("article/assets/fig.png");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("collectMarkdownImageRefs", () => {
  test("本文から複数参照を収集", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-mdimg-"));
    try {
      const contentDir = join(root, "content");
      const staticDir = join(root, "static");
      mkdirSync(staticDir, { recursive: true });
      writeFileSync(join(staticDir, "a.png"), TINY_PNG);
      const refs = collectMarkdownImageRefs({
        body: "![A](../static/a.png)",
        sourceMdRel: "index.md",
        outHtmlRel: "index.html",
        contentDir,
        cwd: root,
        staticDirName: "static",
      });
      expect(refs.length).toBe(1);
      expect(refs[0]!.alt).toBe("A");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});