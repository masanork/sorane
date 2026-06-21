import { describe, expect, test } from "./_expect.ts";
import { parseFaqBody } from "../packages/core/src/faq-page.ts";
import { parseGlossaryBody } from "../packages/core/src/glossary-page.ts";
import { renderMarkdown } from "../packages/core/src/render.ts";

describe("mdast section extract (FAQ)", () => {
  test("### は回答の一部として保持", () => {
    const body = "## Q\n\nAnswer line.\n\n### Sub\n\nSub body.\n";
    const parsed = parseFaqBody(body);
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0]!.answerMarkdown).toContain("### Sub");
    expect(parsed.items[0]!.answerMarkdown).toContain("Sub body.");
  });

  test("コードフェンス内の ## は境界にならない", () => {
    const body = "## Q\n\n```\n## not a question\n```\n\nAfter.\n";
    const parsed = parseFaqBody(body);
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0]!.answerMarkdown).toContain("## not a question");
    expect(parsed.items[0]!.answerMarkdown).toContain("After.");
  });

  test("回答内の ruby が再レンダーで <ruby> になる", () => {
    const body = "## Q?\n\n{配布|はいふ} について。\n";
    const parsed = parseFaqBody(body);
    expect(parsed.items[0]!.answerMarkdown).toContain("{配布|はいふ}");
    const html = renderMarkdown(parsed.items[0]!.answerMarkdown);
    expect(html).toContain("<ruby>配布<rt>はいふ</rt></ruby>");
  });
});

describe("mdast section extract (glossary)", () => {
  test("定義内の ruby と term link を保持", () => {
    const body = "## Term {#term}\n\n{漢字|かんじ} と [[term:other]]。\n";
    const parsed = parseGlossaryBody(body);
    expect(parsed.items[0]!.anchorId).toBe("term");
    expect(parsed.items[0]!.definitionMarkdown).toContain("{漢字|かんじ}");
    expect(parsed.items[0]!.definitionMarkdown).toContain("[[term:other]]");
    const html = renderMarkdown(parsed.items[0]!.definitionMarkdown);
    expect(html).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
    expect(html).toContain('class="glossary-term-unresolved"');
  });
});