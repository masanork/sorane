import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildFontFaceCss,
  buildFontStackCss,
  createFontProcessor,
} from "../packages/font/src/index.ts";

const blogMono = join(import.meta.dirname, "../../blog/assets/fonts/NotoSansMono-Regular.ttf");

describe("buildFontFaceCss", () => {
  test("単一フォントの style を返す", () => {
    const css = buildFontFaceCss("Test", "./font.woff2", "450");
    expect(css).toContain("@font-face");
    expect(css).toContain("font-weight: 450");
    expect(css).toContain("Test");
  });
});

describe("buildFontStackCss", () => {
  test("空は空文字", () => {
    expect(buildFontStackCss([])).toBe("");
  });

  test("複数 face を連結する", () => {
    const css = buildFontStackCss([
      { family: "A", url: "a.woff2", weight: "400" },
      { family: "B", url: "b.woff2", weight: "100 900", format: "opentype" },
    ]);
    expect(css).toContain("A");
    expect(css).toContain("format('opentype')");
  });
});

describe("createFontProcessor", () => {
  test("disabled は null", async () => {
    const proc = await createFontProcessor(process.cwd(), { enabled: false, cache_dir: ".cache", skip_key: "skip" }, "dist");
    expect(proc).toBe(null);
  });

  test("ソース欠落は null", async () => {
    const proc = await createFontProcessor(process.cwd(), {
      enabled: true,
      cache_dir: ".cache",
      skip_key: "skip",
      family: "X",
      source: "missing/font.ttf",
    }, "dist");
    expect(proc).toBe(null);
  });

  test("static フォントで CSS を生成する", async () => {
    if (!existsSync(blogMono)) return;
    const tmp = mkdtempSync(join(tmpdir(), "sorane-font-"));
    try {
      const proc = await createFontProcessor(
        join(import.meta.dirname, "../../blog"),
        {
          enabled: true,
          cache_dir: join(tmp, "cache"),
          skip_key: "noFontEmbedding",
          roles: { body: ["Noto Sans Mono"], code: ["Noto Sans Mono"] },
          sources: {
            "Noto Sans Mono": { source: "assets/fonts/NotoSansMono-Regular.ttf", embed: "static" },
          },
        },
        join(tmp, "dist"),
      );
      expect(proc !== null).toBe(true);
      const css = await proc!.fontCssForPage({
        body: "あいう",
        title: "T",
        frontmatter: { type: "article" },
        rootPrefix: "./",
      });
      expect(css).toContain("@font-face");
      expect(css).toContain("Noto Sans Mono");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("noFontEmbedding でスキップ", async () => {
    if (!existsSync(blogMono)) return;
    const tmp = mkdtempSync(join(tmpdir(), "sorane-font-"));
    try {
      const proc = await createFontProcessor(
        join(import.meta.dirname, "../../blog"),
        {
          enabled: true,
          cache_dir: join(tmp, "cache"),
          skip_key: "noFontEmbedding",
          roles: { body: ["Noto Sans Mono"], code: ["Noto Sans Mono"] },
          sources: {
            "Noto Sans Mono": { source: "assets/fonts/NotoSansMono-Regular.ttf", embed: "static" },
          },
        },
        join(tmp, "dist"),
      );
      const css = await proc!.fontCssForPage({
        body: "text",
        title: "T",
        frontmatter: { noFontEmbedding: true },
        rootPrefix: "./",
      });
      expect(css).toBe(undefined);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("subset フォントを生成する", async () => {
    const vf = join(import.meta.dirname, "../../blog/assets/fonts/NotoSansJP-VF.ttf");
    if (!existsSync(vf)) return;
    const tmp = mkdtempSync(join(tmpdir(), "sorane-font-"));
    try {
      const proc = await createFontProcessor(
        join(import.meta.dirname, "../../blog"),
        {
          enabled: true,
          cache_dir: join(tmp, "cache"),
          skip_key: "noFontEmbedding",
          roles: { body: ["Noto Sans JP"] },
          sources: {
            "Noto Sans JP": { source: "assets/fonts/NotoSansJP-VF.ttf", weight: "100 900" },
          },
        },
        join(tmp, "dist"),
      );
      const css = await proc!.fontCssForPage({
        body: "漢字テスト",
        title: "題",
        frontmatter: {},
        rootPrefix: "../",
      });
      expect(css).toContain("Noto Sans JP");
      expect(css).toContain("woff2");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});