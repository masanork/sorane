import { describe, expect, test } from "./_expect.ts";
import {
  buildFaqPageJsonLd,
  parseFaqBody,
  renderFaqPageBody,
  validateFaqWarnings,
} from "../packages/core/src/faq-page.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("parseFaqBody", () => {
  test("## 見出しで Q/A を分割", () => {
    const body = `Intro line.

## First question?
Answer one.

## Second? {#second}
Answer two.
`;
    const parsed = parseFaqBody(body);
    expect(parsed.items.length).toBe(2);
    expect(parsed.items[0]!.question).toBe("First question?");
    expect(parsed.items[0]!.answerMarkdown).toContain("Answer one");
    expect(parsed.items[1]!.anchorId).toBe("second");
    expect(parsed.preambleMarkdown).toContain("Intro line");
  });
});

describe("validateFaqWarnings", () => {
  test("質問見出し無しを警告", () => {
    const warnings = validateFaqWarnings("Just text.\n");
    expect(warnings.some((w) => w.includes("no ## question"))).toBe(true);
  });

  test("空の回答と preamble を警告", () => {
    const warnings = validateFaqWarnings("Preamble.\n\n## Q?\n\n## Q2?\nA2.\n");
    expect(warnings.some((w) => w.includes("before first question"))).toBe(true);
    expect(warnings.some((w) => w.includes('empty answer for "Q?"'))).toBe(true);
  });
});

describe("renderFaqPageBody", () => {
  test("FAQ セクションと見出し", () => {
    const concept = normalizeConcept(
      {
        type: "faq",
        title: "Help",
        description: "Common questions.",
        profile: "sorane-okf/0.3",
      },
      "body",
      "help",
    );
    const items = parseFaqBody("## Q?\nA.").items;
    const html = renderFaqPageBody(concept, items, ["<p>A.</p>"]);
    expect(html).toContain('class="faq-page"');
    expect(html).toContain("<h1>Help</h1>");
    expect(html).toContain('class="faq-description"');
    expect(html).toContain('<section class="faq">');
    expect(html).toContain('class="faq-question"');
    expect(html).toContain('class="faq-answer"');
    expect(html).toContain("<p>A.</p>");
  });
});

describe("buildFaqPageJsonLd", () => {
  test("FAQPage と mainEntity", () => {
    const script = buildFaqPageJsonLd({
      title: "FAQ",
      url: "https://ex.dev/faq.html",
      siteTitle: "Site",
      lang: "ja",
      items: [{ question: "Q?", answerMarkdown: "A.", line: 1 }],
      answerHtmls: ["<p>A.</p>"],
    });
    expect(script).toContain("FAQPage");
    expect(script).toContain("mainEntity");
    expect(script).toContain('"@type":"Question"');
    expect(script).toContain('"name":"Q?"');
    expect(script).toContain('"text":"A."');
  });
});