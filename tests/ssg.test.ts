import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { extractDescription, buildPage, renderBlogIndexBody } from "../packages/core/src/ssg.ts";
import { buildAtomFeed } from "../packages/core/src/site-meta.ts";
import { migrateToOkf } from "../packages/core/src/migrate.ts";

describe("extractDescription", () => {
  test("最初の散文段落を抽出", () => {
    const d = extractDescription("# Title\n\nFirst paragraph here.\n\nSecond.\n");
    expect(d).toBe("First paragraph here.");
  });
});

describe("renderBlogIndexBody", () => {
  test("最新記事とアーカイブを出す", () => {
    const html = renderBlogIndexBody({
      siteTitle: "My Blog",
      description: "lead text",
      profileUrl: "./profile.html",
      latestArticle: {
        title: "Latest",
        href: "latest.html",
        timestamp: "2025-12-29T00:00:00Z",
        bodyHtml: "<p>Body</p>",
      },
      articles: [{ title: "Older", href: "older.html", timestamp: "2025-01-01T00:00:00Z" }],
    });
    expect(html).toContain("blog-featured");
    expect(html).toContain("過去の記事");
    expect(html).toContain("profile.html");
    expect(html).toContain("Older");
  });

  test("showHeaderTitle: false で blog-header h1 を省略できる", () => {
    const html = renderBlogIndexBody({
      siteTitle: "My Blog",
      description: "lead",
      showHeaderTitle: false,
      articles: [],
    });
    expect(html.includes("<h1>My Blog</h1>")).toBe(false);
    expect(html).toContain("blog-lead");
  });
});

describe("buildAtomFeed", () => {
  test("Atom feed を生成", () => {
    const xml = buildAtomFeed(
      [{ title: "T", url: "https://ex.dev/a.html", id: "https://ex.dev/a.html", updated: "2025-01-01T00:00:00Z" }],
      { siteTitle: "S", siteDescription: "D", baseUrl: "https://ex.dev" },
    );
    expect(xml).toContain("<feed");
    expect(xml).toContain("https://ex.dev/a.html");
  });
});

describe("buildPage", () => {
  test("alternate markdown link を出す", () => {
    const html = buildPage({
      title: "T",
      siteTitle: "Site",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      machineSources: [{ href: "t.md", type: "text/markdown" }],
    });
    expect(html).toContain('rel="alternate"');
    expect(html).toContain("text/markdown");
  });
});

describe("migrateToOkf", () => {
  test("srn 形式を OKF に変換", () => {
    const out = migrateToOkf(
      '---\ntitle: Old\ndate: "2025-06-01"\nlayout: article\n---\n\nBody\n',
      "2025-06-01-old.md",
    );
    expect(out).toContain("type: article");
    expect(out).toContain("timestamp: 2025-06-01T00:00:00Z");
    expect(out).toContain("profile: sorane-okf/0.1");
  });
});

describe("runBuild", () => {
  test("article-only example は index 無しで記事だけ焼く", async () => {
    const exampleRoot = join(import.meta.dirname, "../examples/articles-only");
    const tmp = mkdtempSync(join(tmpdir(), "sorane-articles-"));
    try {
      const result = await runBuild({
        cwd: exampleRoot,
        config: { build: { out_dir: join(tmp, "dist") } },
        clean: true,
      });
      expect(result.pages).toBe(1);
      expect(existsSync(join(tmp, "dist/2025-06-01-note.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/index.html"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("minimal example を dist に焼く", async () => {
    const exampleRoot = join(import.meta.dirname, "../examples/minimal");
    const tmp = mkdtempSync(join(tmpdir(), "sorane-build-"));
    try {
      const result = await runBuild({
        cwd: exampleRoot,
        config: {
          site: {
            title: "Sorane Example",
            description: "desc",
            base_url: "https://example.pages.dev",
            lang: "ja",
          },
          build: {
            content_dir: "content",
            out_dir: join(tmp, "dist"),
            permalink: "{{slug}}.html",
          },
        },
        clean: true,
      });
      expect(result.pages >= 2).toBe(true);
      expect(existsSync(join(tmp, "dist/index.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/2025-01-01-hello.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/archive/index.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/2025-01-01-hello.md"))).toBe(true);
      expect(existsSync(join(tmp, "dist/okf/bundle.tar.gz"))).toBe(true);
      expect(existsSync(join(tmp, "dist/feed.xml"))).toBe(true);
      const html = readFileSync(join(tmp, "dist/2025-01-01-hello.html"), "utf8");
      expect(html).toContain("Hello OKF");
      expect(html).toContain('type="text/markdown"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});