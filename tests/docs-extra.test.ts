import { describe, expect, test } from "./_expect.ts";
import {
  renderDocsArticleFromConceptWithMetaForConfig,
  renderDocsIndexBody,
  resolveDocsNav,
} from "../packages/core/src/docs.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("renderDocsIndexBody", () => {
  test("docs ナビと intro を出す", () => {
    const html = renderDocsIndexBody({
      siteTitle: "Docs",
      description: "Lead",
      introHtml: "<p>Intro</p>",
      docsNav: [
        { href: "guide.html", title: "Guide" },
        { href: "api.html", title: "API" },
      ],
      profileUrl: "./about.html",
      githubUrl: "https://github.com/example/repo",
      lang: "ja",
    });
    expect(html).toContain("docs-index");
    expect(html).toContain("Intro");
    expect(html).toContain("Guide");
    expect(html).toContain("github.com");
  });
});

describe("resolveDocsNav titled entries", () => {
  test("オブジェクト形式の nav を解決", () => {
    const nav = resolveDocsNav(
      [{ href: "start.html", title: "Getting started" }],
      new Map([["other.html", "Other"]]),
    );
    expect(nav).toEqual([{ href: "start.html", title: "Getting started" }]);
  });
});

describe("renderDocsArticleFromConceptWithMetaForConfig", () => {
  test("async で docs 記事をレンダリング", async () => {
    const concept = normalizeConcept(
      { type: "article", title: "Chapter" },
      "## One\n\nFirst.\n\n## Two\n\nSecond.\n",
      "chapter",
    );
    const { bodyHtml } = await renderDocsArticleFromConceptWithMetaForConfig(
      concept,
      { prev: { href: "a.html", title: "A" } },
      "en",
      { badgeHtml: '<span class="badge">AI</span>' },
    );
    expect(bodyHtml).toContain("page-toc");
    expect(bodyHtml).toContain("docs-pager");
    expect(bodyHtml).toContain("badge");
    expect(bodyHtml).toContain("First.");
  });
});