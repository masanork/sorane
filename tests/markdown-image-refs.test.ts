import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import {
  collectMarkdownImageRefs,
  dedupeMarkdownImageRefs,
  extractMarkdownImagePaths,
  resolveMarkdownImageRef,
} from "../packages/core/src/markdown-image-refs.ts";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("extractMarkdownImagePaths", () => {
  test("ローカル画像のみ抽出、外部 URL は除外", () => {
    const paths = extractMarkdownImagePaths(
      '![Alt](../static/a.png)\n![Ext](https://ex.dev/x.png)\n',
    );
    expect(paths.length).toBe(1);
    expect(paths[0]!.path).toBe("../static/a.png");
    expect(paths[0]!.alt).toBe("Alt");
  });
});

describe("resolveMarkdownImageRef", () => {
  test("static 配下の画像を解決", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-img-"));
    const staticDir = join(root, "static");
    const contentDir = join(root, "content");
    mkdirSync(staticDir, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticDir, "hero.png"), TINY_PNG);
    try {
      const ref = resolveMarkdownImageRef({
        markdownPath: "../static/hero.png",
        sourceMdRel: "post.md",
        outHtmlRel: "post.html",
        contentDir,
        cwd: root,
        staticDirName: "static",
        alt: "Hero",
      });
      expect(ref?.kind).toBe("static");
      expect(ref?.publicPath).toBe("static/hero.png");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("collectMarkdownImageRefs", () => {
  test("本文から参照を収集", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-collect-"));
    const contentDir = join(root, "content");
    const articleDir = join(contentDir, "article");
    mkdirSync(articleDir, { recursive: true });
    writeFileSync(join(articleDir, "fig.png"), TINY_PNG);
    try {
      const refs = collectMarkdownImageRefs({
        body: "![Fig](./fig.png)\n",
        sourceMdRel: "article/post.md",
        outHtmlRel: "article/post.html",
        contentDir,
        cwd: root,
        staticDirName: "static",
      });
      expect(refs.length).toBe(1);
      expect(refs[0]!.alt).toBe("Fig");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("dedupeMarkdownImageRefs", () => {
  test("publicPath で重複排除", () => {
    const a = {
      markdownPath: "a.png",
      sourceMdRel: "a.md",
      srcAbs: "/a.png",
      kind: "static" as const,
      publicPath: "static/a.png",
      outRel: "static/a.png",
      alt: "",
    };
    const b = { ...a, sourceMdRel: "b.md" };
    expect(dedupeMarkdownImageRefs([a, b]).length).toBe(1);
  });
});