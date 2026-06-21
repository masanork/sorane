import { describe, expect, test } from "./_expect.ts";
import {
  buildGlossaryPageJsonLd,
  parseGlossaryBody,
  renderGlossaryPageBody,
  resolveGlossaryTerms,
  validateGlossaryWarnings,
} from "../packages/core/src/glossary-page.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("parseGlossaryBody", () => {
  test("## 見出しで用語を分割", () => {
    const body = `## 分散 {#variance}

標本の二乗偏差の平均。

## 標準誤差 {#standard-error}

推定値のばらつき。
`;
    const parsed = parseGlossaryBody(body);
    expect(parsed.items.length).toBe(2);
    expect(parsed.items[0]!.label).toBe("分散");
    expect(parsed.items[0]!.anchorId).toBe("variance");
    expect(parsed.items[0]!.definitionMarkdown).toContain("標本");
  });
});

describe("resolveGlossaryTerms", () => {
  test("本文が空なら frontmatter terms を使う", () => {
    const resolved = resolveGlossaryTerms("", {
      terms: [{ id: "csv", label: "CSV", definition: "Comma-separated values." }],
    });
    expect(resolved.source).toBe("frontmatter");
    expect(resolved.items.length).toBe(1);
    expect(resolved.items[0]!.label).toBe("CSV");
  });
});

describe("validateGlossaryWarnings", () => {
  test("用語無しを警告", () => {
    const warnings = validateGlossaryWarnings("Intro only.\n", {});
    expect(warnings.some((w) => w.includes("no terms found"))).toBe(true);
  });

  test("アンカー欠落と空定義を警告", () => {
    const warnings = validateGlossaryWarnings("## Term\n\n## Other {#id}\nDef.\n", {});
    expect(warnings.some((w) => w.includes('no {#id} anchor'))).toBe(true);
    expect(warnings.some((w) => w.includes('empty definition for "Term"'))).toBe(true);
  });
});

describe("renderGlossaryPageBody", () => {
  test("用語セクションと見出し", () => {
    const concept = normalizeConcept(
      {
        type: "glossary",
        title: "Stats Glossary",
        description: "Statistical terms.",
        language: "ja",
        profile: "sorane-okf/0.3",
      },
      "body",
      "stats",
    );
    const terms = parseGlossaryBody("## Variance {#variance}\nSpread.").items;
    const html = renderGlossaryPageBody(concept, terms, ["<p>Spread.</p>"]);
    expect(html).toContain('class="glossary-page"');
    expect(html).toContain("<h1>Stats Glossary</h1>");
    expect(html).toContain('class="glossary-term"');
    expect(html).toContain('id="variance"');
    expect(html).toContain("<p>Spread.</p>");
  });
});

describe("buildGlossaryPageJsonLd", () => {
  test("DefinedTermSet と hasDefinedTerm", () => {
    const script = buildGlossaryPageJsonLd({
      title: "Glossary",
      url: "https://ex.dev/glossary.html",
      siteTitle: "Site",
      lang: "ja",
      terms: [
        {
          label: "CSV",
          definitionMarkdown: "Comma-separated values.",
          line: 1,
          anchorId: "csv",
        },
      ],
      definitionHtmls: ["<p>Comma-separated values.</p>"],
    });
    expect(script).toContain("DefinedTermSet");
    expect(script).toContain("hasDefinedTerm");
    expect(script).toContain('"@type":"DefinedTerm"');
    expect(script).toContain('"name":"CSV"');
    expect(script).toContain("#csv");
    expect(script).toContain('"termCode":"csv"');
  });
});