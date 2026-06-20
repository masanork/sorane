import { describe, expect, test } from "./_expect.ts";
import {
  renderArchiveListBody,
  renderMonthListForYear,
  renderYearArchiveIndexBody,
  blogPaginationRel,
} from "../packages/core/src/blog-pages.ts";
import { relLinkFrom } from "../packages/core/src/ssg.ts";

describe("relLinkFrom", () => {
  test("archive/index から同年ページへ", () => {
    expect(relLinkFrom("archive/index.html", "archive/2007.html")).toBe("2007.html");
  });

  test("archive/2007 から月ページへ", () => {
    expect(relLinkFrom("archive/2007.html", "archive/2007-05.html")).toBe("2007-05.html");
  });

  test("archive/2007-05 から記事へ", () => {
    expect(relLinkFrom("archive/2007-05.html", "2007-05-06.html")).toBe("../2007-05-06.html");
  });

  test("page/2 から index へ", () => {
    expect(relLinkFrom("page/2.html", "index.html")).toBe("../index.html");
  });

  test("page/2 から page/3 へ", () => {
    expect(relLinkFrom("page/2.html", "page/3.html")).toBe("3.html");
  });
});

describe("blogPaginationRel", () => {
  test("1 ページ目は index.html", () => {
    expect(blogPaginationRel(1)).toBe("index.html");
  });

  test("2 ページ目以降は page/N.html", () => {
    expect(blogPaginationRel(2)).toBe("page/2.html");
  });
});

describe("renderYearArchiveIndexBody", () => {
  test("年リンクが同一ディレクトリ相対になる", () => {
    const byYear = new Map([["2007", [{ title: "T", href: "a.html" }]]]);
    const html = renderYearArchiveIndexBody("Site", byYear, "archive/index.html");
    expect(html).toContain('href="2007.html"');
    expect(html.includes('href="archive/2007.html"')).toBe(false);
  });
});

describe("renderMonthListForYear", () => {
  test("月リンクと戻りリンクが相対になる", () => {
    const byMonth = new Map([["2007-05", [{ title: "T", href: "a.html" }]]]);
    const html = renderMonthListForYear("2007", byMonth, "archive/2007.html");
    expect(html).toContain('href="2007-05.html"');
    expect(html).toContain('href="index.html"');
    expect(html.includes('href="archive/')).toBe(false);
  });
});

describe("renderArchiveListBody", () => {
  test("サブディレクトリから記事とページネーションを解決する", () => {
    const html = renderArchiveListBody(
      "Page 2",
      undefined,
      [{ title: "Article", href: "2015-05-17.html", timestamp: "2015-05-17T00:00:00Z" }],
      { fromRel: "page/2.html", page: 2, totalPages: 3 },
    );
    expect(html).toContain('href="../2015-05-17.html"');
    expect(html).toContain('href="../index.html" rel="prev"');
    expect(html).toContain('href="3.html" rel="next"');
  });
});