import { describe, expect, test } from "./_expect.ts";
import { extractCharset, plainTextFromHtml } from "../packages/font/src/extract-charset.ts";
import { siteChromeText } from "../packages/core/src/site-labels.ts";

describe("plainTextFromHtml", () => {
  test("タグを除去する", () => {
    const t = plainTextFromHtml("<p>今日<strong>開発</strong></p>");
    expect(t).toBe("今日開発");
  });
});

describe("extractCharset extra", () => {
  test("extra に漢字を含められる", () => {
    const base = extractCharset("", "雑種路線");
    const withExtra = extractCharset("", "雑種路線", undefined, "レッドチームと踊る");
    expect(withExtra.includes("レ")).toBe(true);
    expect(withExtra.includes("踊")).toBe(true);
    expect(base.includes("踊")).toBe(false);
  });
});

describe("siteChromeText", () => {
  test("ja ラベルを含む", () => {
    const t = siteChromeText("ja", "My Site");
    expect(t).toContain("アーカイブ");
    expect(t).toContain("過去の記事");
  });
});