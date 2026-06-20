import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { emitPage } from "../packages/core/src/emit-page.ts";
import {
  extractDescription,
  sanitizeListDescription,
  renderFeaturedExcerpt,
  buildPage,
  renderBlogIndexBody,
  renderArticleBody,
  articleFontClass,
  rootPrefixFromRel,
  relLinkFrom,
  slugifyTag,
  isSearchView,
  buildWebSiteJsonLd,
  buildBlogPostingJsonLd,
} from "../packages/core/src/ssg.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";
import { buildAtomFeed } from "../packages/core/src/site-meta.ts";
import { migrateToOkf } from "../packages/core/src/migrate.ts";

describe("extractDescription", () => {
  test("最初の散文段落を抽出", () => {
    const d = extractDescription("# Title\n\nFirst paragraph here.\n\nSecond.\n");
    expect(d).toBe("First paragraph here.");
  });

  test("HTML 行の前の散文はスキップして次を取る", () => {
    const d = extractDescription("# T\n\n<p>x</p>\n\nPlain text here.\n");
    expect(d).toBe("Plain text here.");
  });
});

describe("rootPrefixFromRel", () => {
  test("深さに応じた prefix", () => {
    expect(rootPrefixFromRel("index.html")).toBe("./");
    expect(rootPrefixFromRel("archive/2007.html")).toBe("../");
  });
});

describe("slugifyTag", () => {
  test("タグを slug 化", () => {
    expect(slugifyTag("Hello World")).toBe("hello-world");
    expect(slugifyTag("  ")).toBe("");
  });
});

describe("isSearchView", () => {
  test("view: search を判定", () => {
    expect(isSearchView({ view: "search" })).toBe(true);
    expect(isSearchView({})).toBe(false);
  });
});

describe("JSON-LD", () => {
  test("WebSite と BlogPosting", () => {
    const site = buildWebSiteJsonLd({ title: "S", lang: "ja", url: "https://ex.dev" });
    expect(site).toContain("WebSite");
    const post = buildBlogPostingJsonLd({
      title: "T",
      url: "https://ex.dev/t.html",
      siteTitle: "S",
      lang: "ja",
      datePublished: "2025-01-01T00:00:00Z",
    });
    expect(post).toContain("BlogPosting");
  });
});

describe("sanitizeListDescription", () => {
  test("HTML タグを除去する", () => {
    const d = sanitizeListDescription('hello <a href="x">link</a> world');
    expect(d).toBe("hello link world");
  });
});

describe("renderFeaturedExcerpt", () => {
  test("抜粋を p タグで返す", () => {
    const concept = normalizeConcept(
      { type: "article", title: "T" },
      "First para.\n\nSecond para.",
      "a",
    );
    const html = renderFeaturedExcerpt(concept, 400);
    expect(html).toContain("<p>First para.</p>");
    expect(html.includes("<h")).toBe(false);
  });
});

describe("articleFontClass", () => {
  test("font: GJM で font-serif", () => {
    const concept = normalizeConcept({ type: "article", title: "T", font: "GJM" }, "body", "a");
    expect(articleFontClass(concept)).toBe(" font-serif");
  });

  test("font 未指定は空", () => {
    const concept = normalizeConcept({ type: "article", title: "T" }, "body", "a");
    expect(articleFontClass(concept)).toBe("");
  });
});

describe("renderArticleBody", () => {
  test("font: GJM で article-page に font-serif", () => {
    const concept = normalizeConcept({ type: "article", title: "T", font: "GJM" }, "body", "a");
    const html = renderArticleBody(concept);
    expect(html).toContain('class="article-page font-serif"');
  });
});

describe("renderBlogIndexBody", () => {
  test("最新記事とアーカイブを出す", () => {
    const html = renderBlogIndexBody({
      siteTitle: "My Blog",
      description: "lead text",
      lang: "en",
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
    expect(html).toContain("Archive");
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

  test("showListDescriptions で description を出す", () => {
    const html = renderBlogIndexBody({
      siteTitle: "Blog",
      articles: [{ title: "A", href: "a.html", timestamp: "2025-01-01T00:00:00Z", description: "lead" }],
      showListDescriptions: true,
    });
    expect(html).toContain("lead");
  });

  test("lang: ja で日本語ラベル", () => {
    const html = renderBlogIndexBody({
      siteTitle: "Blog",
      lang: "ja",
      articles: [{ title: "古い記事", href: "old.html", timestamp: "2025-01-01T00:00:00Z" }],
    });
    expect(html).toContain("過去の記事");
    expect(html).toContain("古い記事");
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

describe("emitPage", () => {
  test("extraHead と fontCss を両方 head に出す", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-emit-"));
    try {
      const concept = normalizeConcept({ type: "article", title: "T" }, "Body", "t");
      emitPage({
        cwd: tmp,
        config: {
          site: { title: "Site", lang: "ja" },
          build: { content_dir: "content", out_dir: join(tmp, "dist") },
        },
        outDir: join(tmp, "dist"),
        outRel: "t.html",
        concept,
        bodyHtml: "<p>Body</p>",
        baseUrl: "",
        extraHead: ['<script type="application/ld+json">{}</script>'],
        fontCss: "<style>@font-face { font-family: 'X'; }</style>",
      });
      const html = readFileSync(join(tmp, "dist/t.html"), "utf8");
      expect(html).toContain("application/ld+json");
      expect(html).toContain("@font-face");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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

  test("index は og:type website", () => {
    const html = buildPage({
      title: "Blog",
      siteTitle: "Blog",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      pageKind: "website",
      lang: "ja",
      showArchiveNav: true,
    });
    expect(html).toContain('og:type" content="website"');
    expect(html).toContain("アーカイブ");
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