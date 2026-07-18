import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
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
import { parseAiDisclosure } from "../packages/core/src/ai-disclosure.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";
import { buildAtomFeed, buildLlmsTxt } from "../packages/core/src/site-meta.ts";
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

  test("BlogPosting に associatedMedia を含める", () => {
    const post = buildBlogPostingJsonLd({
      title: "T",
      url: "https://ex.dev/t.html",
      siteTitle: "S",
      lang: "ja",
      associatedMedia: [
        {
          contentUrl: "https://ex.dev/static/hero.png",
          digitalSourceType:
            "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
          name: "Hero",
        },
      ],
    });
    expect(post).toContain("associatedMedia");
    expect(post).toContain("ImageObject");
    expect(post).toContain("hero.png");
  });

  test("BlogPosting に digitalSourceType を含める", () => {
    const d = parseAiDisclosure({ digitalSourceType: "trainedAlgorithmicMedia" })!;
    const post = buildBlogPostingJsonLd({
      title: "T",
      url: "https://ex.dev/t.html",
      siteTitle: "S",
      lang: "ja",
      aiDisclosure: d,
    });
    expect(post).toContain("trainedAlgorithmicMedia");
    expect(post).toContain("digitalSourceType");
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

  test("続き一覧と年別へのナビを出す", () => {
    const html = renderBlogIndexBody({
      siteTitle: "Blog",
      lang: "ja",
      articles: [{ title: "古い記事", href: "old.html", timestamp: "2025-01-01T00:00:00Z" }],
      moreArticlesHref: "page/2.html",
      yearArchiveHref: "archive/index.html",
    });
    expect(html).toContain('class="blog-archive-nav"');
    expect(html).toContain('href="page/2.html"');
    expect(html).toContain("さらに読む →");
    expect(html).toContain('href="archive/index.html"');
    expect(html).toContain("年別に探す");
  });
});

describe("buildSearchMount", () => {
  test("header variant でコンパクト検索を出す", async () => {
    const { buildSearchMount } = await import("../packages/core/src/ssg.ts");
    const html = buildSearchMount("./", { variant: "header" });
    expect(html).toContain('class="search search--header"');
    expect(html).not.toContain("search-facet");
  });

  test("page variant は OKF 0.3 型ファセットを出す", async () => {
    const { buildSearchMount } = await import("../packages/core/src/ssg.ts");
    const html = buildSearchMount("./", { lang: "ja" });
    expect(html).toContain('value="dataset"');
    expect(html).toContain('value="glossary"');
    expect(html).toContain("データセット");
    expect(html).toContain("search-facet--source");
    expect(html).toContain('value="ai-generated"');
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

  test("AI disclosure category term を含める", () => {
    const xml = buildAtomFeed(
      [
        {
          title: "AI",
          url: "https://ex.dev/a.html",
          id: "https://ex.dev/a.html",
          updated: "2025-01-01T00:00:00Z",
          digitalSourceCode: "trainedAlgorithmicMedia",
        },
      ],
      { siteTitle: "S", siteDescription: "D", baseUrl: "https://ex.dev" },
    );
    expect(xml).toContain('term="ai-disclosure:trainedAlgorithmicMedia"');
    expect(xml).toContain("digitalsourcetype");
  });
});

describe("buildLlmsTxt", () => {
  test("aiLabeledCount セクションを追加する", () => {
    const txt = buildLlmsTxt({
      siteTitle: "S",
      siteDescription: "D",
      baseUrl: "https://ex.dev",
      aiLabeledCount: 2,
    });
    expect(txt).toContain("## AI content disclosure");
    expect(txt).toContain("Labeled articles: 2");
  });

  test("diagramsEnabled で図表フェンスの説明を追加する", () => {
    const txt = buildLlmsTxt({
      siteTitle: "S",
      siteDescription: "D",
      baseUrl: "https://ex.dev",
      diagramsEnabled: true,
    });
    expect(txt).toContain("```mermaid");
    expect(txt).toContain("sorane-mermaid-loader.mjs");
  });
});

describe("emitPage", () => {
  test("extraHead と fontCss を両方 head に出す", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-emit-"));
    try {
      const concept = normalizeConcept({ type: "article", title: "T" }, "Body", "t");
      emitPage({
        cwd: tmp,
        config: mergeConfig({
          site: { title: "Site", lang: "ja" },
          build: { out_dir: join(tmp, "dist") },
        } as Partial<SoraneConfig>),
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
    expect(html).toContain("年別に探す");
  });

  test("全ページにスキップリンクと main ランドマークを出す", () => {
    const html = buildPage({
      title: "Post",
      siteTitle: "Site",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      lang: "ja",
    });
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="#main"');
    expect(html).toContain("<main id=\"main\">");
  });

  test("site.license でフッターにライセンス行", () => {
    const html = buildPage({
      title: "T",
      siteTitle: "Site",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      siteLicense: {
        id: "MIT",
        url: "https://opensource.org/license/mit",
        page: "license.html",
        copyright: "2023 Example",
      },
    });
    expect(html).toContain('class="site-footer-meta"');
    expect(html).toContain('rel="license"');
    expect(html).toContain("license.html");
    expect(html).toContain("© 2023 Example");
  });

  test("OG / Twitter メタを出す", () => {
    const html = buildPage({
      title: "Post",
      siteTitle: "Site",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      description: "Lead",
      canonicalUrl: "https://ex.dev/post.html",
      lang: "ja",
      ogImageUrl: "https://ex.dev/assets/og.png",
    });
    expect(html).toContain('property="og:image" content="https://ex.dev/assets/og.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('property="og:locale" content="ja_JP"');
    expect(html).toContain('name="twitter:title" content="Post"');
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

describe("resolveThemeCss", () => {
  test("website/ からリポジトリ直下の templates を解決する", async () => {
    const { resolveThemeCss } = await import("../packages/core/src/build.ts");
    const websiteRoot = join(import.meta.dirname, "../website");
    const css = resolveThemeCss(websiteRoot);
    expect(css?.endsWith("templates/default/assets/main.css")).toBe(true);
    expect(existsSync(css!)).toBe(true);
  });
});

describe("runBuild", () => {
  test("article-only example は index 無しで記事だけ焼く", async () => {
    const exampleRoot = join(import.meta.dirname, "../examples/articles-only");
    const tmp = mkdtempSync(join(tmpdir(), "sorane-articles-"));
    try {
      const result = await runBuild({
        cwd: exampleRoot,
        config: { build: { out_dir: join(tmp, "dist") } } as Partial<SoraneConfig>,
        clean: true,
      });
      expect(result.pages).toBe(2);
      expect(existsSync(join(tmp, "dist/2025-06-01-note.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/index.html"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("open-data example は dataset ページと catalog 分離を出す", async () => {
    const exampleRoot = join(import.meta.dirname, "../examples/open-data");
    const tmp = mkdtempSync(join(tmpdir(), "sorane-open-data-"));
    const { loadSoraneConfig } = await import("../packages/cli/src/config-load.ts");
    const exampleConfig = loadSoraneConfig(exampleRoot);
    try {
      const result = await runBuild({
        cwd: exampleRoot,
        config: {
          ...exampleConfig,
          build: { ...exampleConfig.build, out_dir: join(tmp, "dist") },
        },
        clean: true,
      });
      expect(result.pages >= 2).toBe(true);
      const html = readFileSync(join(tmp, "dist/transit-stops.html"), "utf8");
      expect(html).toContain("Transit Stops");
      expect(html).toContain("dataset-meta");
      expect(html).toContain("Stops CSV");
      expect(html).toContain('application/ld+json');
      expect(html).toContain('"@type":"Dataset"');
      const catalog = readFileSync(join(tmp, "dist/catalog.jsonld"), "utf8");
      const parsed = JSON.parse(catalog) as {
        dataset?: unknown[];
        hasPart?: { "@type": string }[];
      };
      expect(parsed.dataset?.length).toBe(1);
      expect((parsed.hasPart ?? []).length >= 3).toBe(true);
      const hasPartTypes = (parsed.hasPart ?? []).map((p) => p["@type"]);
      expect(hasPartTypes).toContain("FAQPage");
      expect(hasPartTypes).toContain("DefinedTermSet");
      expect(hasPartTypes).toContain("TechArticle");

      const refHtml = readFileSync(join(tmp, "dist/stops-csv-fields.html"), "utf8");
      expect(refHtml).toContain('class="reference-page"');
      expect(refHtml).toContain("isBasedOn");

      const faqHtml = readFileSync(join(tmp, "dist/faq.html"), "utf8");
      expect(faqHtml).toContain('class="faq-page"');
      expect(faqHtml).toContain("mainEntity");

      const glossaryHtml = readFileSync(join(tmp, "dist/glossary.html"), "utf8");
      expect(glossaryHtml).toContain('class="glossary-page"');
      expect(glossaryHtml).toContain("hasDefinedTerm");

      const searchHtml = readFileSync(join(tmp, "dist/search.html"), "utf8");
      expect(searchHtml).toContain('class="search"');
      expect(searchHtml).toContain('value="dataset"');

      const dcatCatalog = readFileSync(join(tmp, "dist/catalog-dcat.jsonld"), "utf8");
      const dcatParsed = JSON.parse(dcatCatalog) as Record<string, unknown>;
      expect(dcatParsed["@type"]).toBe("dcat:Catalog");
      expect(Array.isArray(dcatParsed["dcat:dataset"])).toBe(true);
      expect((dcatParsed["dcat:dataset"] as unknown[]).length).toBe(1);

      const llms = readFileSync(join(tmp, "dist/llms.txt"), "utf8");
      expect(llms).toContain("catalog-dcat.jsonld");
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
      expect(result.durationMs >= 0).toBe(true);
      expect(existsSync(join(tmp, "dist/index.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/2025-01-01-hello.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/archive/index.html"))).toBe(false);
      expect(existsSync(join(tmp, "dist/2025-01-01-hello.md"))).toBe(false);
      expect(existsSync(join(tmp, "dist/404.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/okf/bundle.tar.gz"))).toBe(false);
      expect(existsSync(join(tmp, "dist/feed.xml"))).toBe(true);
      const html = readFileSync(join(tmp, "dist/2025-01-01-hello.html"), "utf8");
      expect(html).toContain("Hello OKF");
      expect(html.includes('type="text/markdown"')).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});