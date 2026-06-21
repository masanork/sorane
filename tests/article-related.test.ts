import { describe, expect, test } from "./_expect.ts";
import {
  docsLandingCtas,
  renderArticleRelatedHtml,
  resolveRelatedLinks,
} from "../packages/core/src/article-related.ts";
import { docsSectionPeers } from "../packages/core/src/docs.ts";

describe("docsSectionPeers", () => {
  test("同一セクションの他ページを返す", () => {
    const nav = [
      { section: "はじめに" },
      { href: "a.html", title: "A" },
      { href: "b.html", title: "B" },
      { section: "運用" },
      { href: "c.html", title: "C" },
    ];
    expect(docsSectionPeers("b.html", nav)).toEqual([{ href: "a.html", title: "A" }]);
    expect(docsSectionPeers("c.html", nav)).toEqual([]);
  });
});

describe("resolveRelatedLinks", () => {
  test("frontmatter related を解決する", () => {
    const links = resolveRelatedLinks({
      frontmatter: { related: ["features.html", "cli.html"] },
      currentHref: "getting-started.html",
      titleByHref: new Map([
        ["features.html", "機能"],
        ["cli.html", "CLI"],
      ]),
    });
    expect(links).toEqual([
      { href: "features.html", title: "機能" },
      { href: "cli.html", title: "CLI" },
    ]);
  });

  test("docs セクションのピアを足す", () => {
    const nav = [
      { section: "はじめに" },
      { href: "a.html", title: "A" },
      { href: "b.html", title: "B" },
    ];
    const links = resolveRelatedLinks({
      frontmatter: {},
      currentHref: "a.html",
      titleByHref: new Map(),
      docsNav: nav,
      includeSectionPeers: true,
    });
    expect(links).toEqual([{ href: "b.html", title: "B" }]);
  });
});

describe("docsLandingCtas", () => {
  test("先頭セクションの先頭 2 件", () => {
    const nav = [
      { section: "はじめに" },
      { href: "getting-started.html", title: "はじめに" },
      { href: "features.html", title: "機能" },
      { href: "cli.html", title: "CLI" },
    ];
    expect(docsLandingCtas(nav)).toEqual([
      { href: "getting-started.html", title: "はじめに" },
      { href: "features.html", title: "機能" },
    ]);
  });
});

describe("renderArticleRelatedHtml", () => {
  test("関連リンクブロックを出す", () => {
    const html = renderArticleRelatedHtml(
      [{ href: "features.html", title: "機能" }],
      "getting-started.html",
      "ja",
    );
    expect(html).toContain('class="article-related"');
    expect(html).toContain("関連ページ");
    expect(html).toContain("features.html");
  });
});