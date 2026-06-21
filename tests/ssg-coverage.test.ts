import { describe, expect, test } from "./_expect.ts";
import { parseAiDisclosure } from "../packages/core/src/ai-disclosure.ts";
import {
  buildCreativeWorkJsonLd,
  buildSearchHead,
  renderArticleBodyWithMeta,
  renderArticleBodyWithMetaForConfig,
  renderIndexBody,
} from "../packages/core/src/ssg.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("buildCreativeWorkJsonLd", () => {
  test("TechArticle と FAQPage", () => {
    const tech = buildCreativeWorkJsonLd({
      workType: "TechArticle",
      title: "Guide",
      url: "https://ex.dev/guide.html",
      siteTitle: "Site",
      lang: "en",
      description: "desc",
      datePublished: "2025-01-01T00:00:00Z",
      author: "Author",
    });
    expect(tech).toContain("TechArticle");
    expect(tech).toContain("WebSite");
    expect(tech).toContain("Author");

    const faq = buildCreativeWorkJsonLd({
      workType: "FAQPage",
      title: "FAQ",
      url: "https://ex.dev/faq.html",
      siteTitle: "Site",
      lang: "ja",
    });
    expect(faq).toContain("FAQPage");
  });

  test("AI disclosure を含める", () => {
    const d = parseAiDisclosure({ digitalSourceType: "trainedAlgorithmicMedia" })!;
    const json = buildCreativeWorkJsonLd({
      workType: "BlogPosting",
      title: "T",
      url: "https://ex.dev/t.html",
      siteTitle: "S",
      lang: "ja",
      aiDisclosure: d,
    });
    expect(json).toContain("digitalSourceType");
  });
});

describe("buildSearchHead", () => {
  test("hybrid と fts モード", () => {
    const hybrid = buildSearchHead("./", "hybrid");
    expect(hybrid.some((h) => h.includes("importmap"))).toBe(true);
    const fts = buildSearchHead("../", "fts");
    expect(fts.length === 1).toBe(true);
    expect(fts[0]).toContain("search.mjs");
  });
});

describe("renderIndexBody", () => {
  test("記事リストを出す", () => {
    const html = renderIndexBody("Blog", [
      { title: "First", href: "first.html", timestamp: "2025-01-01T00:00:00Z" },
      { title: "Second", href: "second.html", timestamp: "2024-12-01T00:00:00Z" },
    ]);
    expect(html).toContain("First");
    expect(html).toContain("Second");
    expect(html).toContain("blog-list");
  });
});

describe("renderArticleBodyWithMeta", () => {
  test("nav と badge を含める", () => {
    const concept = normalizeConcept(
      {
        type: "article",
        title: "Post",
        timestamp: "2025-01-01T00:00:00Z",
        tags: ["demo"],
        author: "Alice",
        updated: "2025-02-01",
      },
      "## Post\n\nParagraph.\n",
      "post",
    );
    const { bodyHtml } = renderArticleBodyWithMeta(concept, {
      prev: { href: "prev.html", title: "Prev" },
      next: { href: "next.html", title: "Next" },
    });
    expect(bodyHtml).toContain("article-nav");
    expect(bodyHtml).toContain("Prev");
    expect(bodyHtml).toContain("Next");
    expect(bodyHtml).toContain("demo");
    expect(bodyHtml).toContain("Alice");
  });
});

describe("renderArticleBodyWithMetaForConfig", () => {
  test("async レンダリング", async () => {
    const concept = normalizeConcept({ type: "article", title: "T" }, "Hello **world**.\n", "t");
    const { bodyHtml } = await renderArticleBodyWithMetaForConfig(concept);
    expect(bodyHtml).toContain("<strong>world</strong>");
  });
});