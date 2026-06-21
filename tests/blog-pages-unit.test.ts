import { describe, expect, test } from "./_expect.ts";
import {
  groupByTag,
  groupByYear,
  groupByYearMonth,
  paginate,
  renderArchiveListBody,
} from "../packages/core/src/blog-pages.ts";
import type { ArticleListEntry } from "../packages/core/src/ssg.ts";

const articles: ArticleListEntry[] = [
  { title: "A", href: "a.html", timestamp: "2025-03-15T00:00:00Z", tags: ["Hello World", ""] },
  { title: "B", href: "b.html", timestamp: "2024-12-01T00:00:00Z", tags: ["hello-world"] },
  { title: "C", href: "c.html" },
];

describe("groupByYearMonth", () => {
  test("年月でグループ化、timestamp 無しは除外", () => {
    const map = groupByYearMonth(articles);
    expect(map.get("2025-03")?.length).toBe(1);
    expect(map.get("2024-12")?.length).toBe(1);
    expect(map.has("")).toBe(false);
  });
});

describe("groupByYear", () => {
  test("年でグループ化", () => {
    const map = groupByYear(articles);
    expect(map.get("2025")?.length).toBe(1);
    expect(map.get("2024")?.length).toBe(1);
  });
});

describe("groupByTag", () => {
  test("タグ slug でグループ化、空タグは除外", () => {
    const map = groupByTag(articles);
    expect(map.get("hello-world")?.length).toBe(2);
  });
});

describe("paginate", () => {
  test("ページサイズで分割", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([], 10)).toEqual([]);
  });
});

describe("renderArchiveListBody", () => {
  test("description と listRootPrefix", () => {
    const html = renderArchiveListBody("Title", "Lead text", articles.slice(0, 1), {
      fromRel: "archive/index.html",
      listRootPrefix: "../",
    });
    expect(html).toContain("Lead text");
    expect(html).toContain('datetime="2025-03-15"');
  });
});