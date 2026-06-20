import { describe, expect, test } from "./_expect.ts";
import {
  docsNavFor,
  docsSidebarHtml,
  renderDocsArticleFromConcept,
  resolveDocsNav,
} from "../packages/core/src/docs.ts";
import { buildPage } from "../packages/core/src/ssg.ts";
import { renderMarkdownDocument } from "../packages/core/src/render.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("renderMarkdownDocument", () => {
  test("見出しに id とアンカーを付与する", () => {
    const { html, outline } = renderMarkdownDocument(
      "## First\n\nText\n\n### Nested\n\nMore\n",
    );
    expect(html).toContain('id="first"');
    expect(html).toContain('class="heading-anchor"');
    expect(outline.length >= 2).toBe(true);
    expect(outline[0]?.text).toBe("First");
  });
});

describe("resolveDocsNav", () => {
  test("href からタイトルを解決する", () => {
    const titles = new Map([["cli.html", "CLI リファレンス"]]);
    const nav = resolveDocsNav(["cli.html"], titles);
    expect(nav).toEqual([{ href: "cli.html", title: "CLI リファレンス" }]);
  });
});

describe("docsNavFor", () => {
  test("前後ページを返す", () => {
    const items = [
      { href: "a.html", title: "A" },
      { href: "b.html", title: "B" },
      { href: "c.html", title: "C" },
    ];
    expect(docsNavFor("b.html", items)).toEqual({
      prev: { href: "a.html", title: "A" },
      next: { href: "c.html", title: "C" },
    });
  });
});

describe("docsSidebarHtml", () => {
  test("現在地に aria-current を付与する", () => {
    const html = docsSidebarHtml(
      [
        { href: "a.html", title: "A" },
        { href: "b.html", title: "B" },
      ],
      "b.html",
      "b.html",
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">B</a>");
  });
});

describe("renderDocsArticleFromConcept", () => {
  test("目次とページャを含む", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Test", excludeFromList: true },
      "## One\n\nBody\n\n## Two\n\nMore\n",
      "test",
    );
    const html = renderDocsArticleFromConcept(
      concept,
      { prev: { href: "a.html", title: "A" }, next: { href: "c.html", title: "C" } },
      "ja",
    );
    expect(html).toContain('class="page-toc"');
    expect(html).toContain('class="docs-pager"');
    expect(html).toContain("前へ");
    expect(html).toContain("次へ");
  });

  test("badgeHtml をヘッダに挿入する", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Test" },
      "Body\n",
      "test",
    );
    const html = renderDocsArticleFromConcept(concept, undefined, "ja", {
      badgeHtml: '<aside class="ai-disclosure">badge</aside>',
    });
    expect(html).toContain('class="ai-disclosure"');
  });
});

describe("buildPage docs layout", () => {
  test("サイドバーとスキップリンクを出力する", () => {
    const html = buildPage({
      title: "CLI",
      siteTitle: "sorane",
      bodyHtml: "<p>body</p>",
      rootPrefix: "./",
      docsLayout: true,
      docsSidebarHtml: '<nav class="docs-sidebar-nav">nav</nav>',
    });
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('class="docs-layout"');
    expect(html).toContain('id="main"');
  });
});