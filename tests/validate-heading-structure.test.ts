import { describe, expect, test } from "./_expect.ts";
import { validateHeadingWarnings } from "../packages/core/src/validate-heading-structure.ts";

describe("validateHeadingWarnings", () => {
  test("h1 in body を警告", () => {
    const warnings = validateHeadingWarnings("# Title\n\n## Section\n");
    expect(warnings.some((w) => w.includes("h1 in body"))).toBe(true);
  });

  test("階層スキップを警告", () => {
    const warnings = validateHeadingWarnings("## A\n\n#### B\n");
    expect(warnings.some((w) => w.includes("skip from h2 to h4"))).toBe(true);
  });

  test("コードフェンス内は無視", () => {
    const body = "## Real\n\n```md\n# Not a heading\n```\n";
    expect(validateHeadingWarnings(body)).toEqual([]);
  });
});