import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import {
  isNotFoundSource,
  renderDefaultNotFoundBody,
} from "../packages/core/src/not-found.ts";
import { runBuild } from "../packages/core/src/build.ts";
import type { SoraneConfig } from "../packages/core/src/config.ts";
import { buildSitemapXml } from "../packages/core/src/site-meta.ts";

describe("isNotFoundSource", () => {
  test("404.md を検出する", () => {
    expect(isNotFoundSource("404.md")).toBe(true);
    expect(isNotFoundSource("content/404.md")).toBe(true);
    expect(isNotFoundSource("article/hello.md")).toBe(false);
  });
});

describe("renderDefaultNotFoundBody", () => {
  test("ja は日英メッセージ", () => {
    const html = renderDefaultNotFoundBody("ja");
    expect(html).toContain("指定されたページは存在しません");
    expect(html).toContain('lang="en"');
    expect(html).toContain("トップページへ");
  });
});

describe("runBuild 404.html", () => {
  test("content/404.md 無しでも 404.html を出す", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-404-default-"));
    const contentDir = join(root, "content");
    const outDir = join(root, "dist");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nWelcome.\n",
      "utf8",
    );
    try {
      await runBuild({
        cwd: root,
        config: {
          site: { title: "T", description: "d", base_url: "https://ex.dev", lang: "ja" },
          build: { content_dir: "content", out_dir: outDir, permalink: "{{slug}}.html" },
        },
        clean: true,
      });
      const html = readFileSync(join(outDir, "404.html"), "utf8");
      expect(html).toContain('class="skip-link"');
      expect(html).toContain("指定されたページは存在しません");
      const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf8");
      expect(sitemap).not.toContain("404.html");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("content/404.md でカスタム本文", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-404-custom-"));
    const contentDir = join(root, "content");
    const outDir = join(root, "dist");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n",
      "utf8",
    );
    writeFileSync(
      join(contentDir, "404.md"),
      "---\ntype: article\ntitle: Not here\nprofile: sorane-okf/0.1\n---\n\nCustom 404 copy.\n",
      "utf8",
    );
    try {
      await runBuild({
        cwd: root,
        config: {
          site: { title: "T", description: "d", base_url: "", lang: "en" },
          build: { content_dir: "content", out_dir: outDir, permalink: "{{slug}}.html" },
        } as Partial<SoraneConfig>,
        clean: true,
      });
      const html = readFileSync(join(outDir, "404.html"), "utf8");
      expect(html).toContain("Custom 404 copy.");
      expect(html).toContain("<h1>Not here</h1>");
      expect(existsSync(join(outDir, "404.md"))).toBe(true);
      expect(existsSync(join(outDir, "404.html.html"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});