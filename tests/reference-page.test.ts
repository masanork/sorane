import { describe, expect, test } from "./_expect.ts";
import {
  bodyHasGfmTable,
  buildReferencePageJsonLd,
  renderReferencePageBody,
  validateReferenceWarnings,
} from "../packages/core/src/reference-page.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("bodyHasGfmTable", () => {
  test("GFM テーブルを検出", () => {
    const body = "| A | B |\n|---|---|\n| 1 | 2 |\n";
    expect(bodyHasGfmTable(body)).toBe(true);
    expect(bodyHasGfmTable("```\n| A |\n|---|\n```\n")).toBe(false);
  });
});

describe("validateReferenceWarnings", () => {
  test("推奨フィールドとテーブル欠落を警告", () => {
    const warnings = validateReferenceWarnings("Plain text.\n", { frontmatter: {} });
    expect(warnings.some((w) => w.includes("missing description"))).toBe(true);
    expect(warnings.some((w) => w.includes("missing resource"))).toBe(true);
    expect(warnings.some((w) => w.includes("no GFM table"))).toBe(true);
  });
});

describe("renderReferencePageBody", () => {
  test("メタデータと本文", () => {
    const concept = normalizeConcept(
      {
        type: "reference",
        title: "API Fields",
        description: "Field list.",
        resource: "https://ex.dev/spec",
        profile: "sorane-okf/0.3",
      },
      "body",
      "api",
    );
    const html = renderReferencePageBody(concept, "<table><tr><td>x</td></tr></table>");
    expect(html).toContain('class="reference-page"');
    expect(html).toContain("<h1>API Fields</h1>");
    expect(html).toContain('class="reference-description"');
    expect(html).toContain("https://ex.dev/spec");
    expect(html).toContain('class="reference-body"');
  });
});

describe("buildReferencePageJsonLd", () => {
  test("TechArticle と isBasedOn", () => {
    const script = buildReferencePageJsonLd({
      title: "API",
      description: "Fields",
      url: "https://ex.dev/api.html",
      resource: "https://ex.dev/spec",
      siteTitle: "Site",
      lang: "en",
      tags: ["api"],
    });
    expect(script).toContain("TechArticle");
    expect(script).toContain("isBasedOn");
    expect(script).toContain("https://ex.dev/spec");
    expect(script).toContain('"genre":"reference"');
    expect(script).toContain('"reference"');
  });
});