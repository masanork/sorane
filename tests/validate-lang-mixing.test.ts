import { describe, expect, test } from "./_expect.ts";
import { validateLangMixingWarnings } from "../packages/core/src/validate-lang-mixing.ts";

describe("validateLangMixingWarnings", () => {
  test("warns on mixed JA/Latin without lang markup", () => {
    const warnings = validateLangMixingWarnings(
      "database サーバーの説明です。\n",
      "ja",
    );
    expect(warnings.some((w) => w.includes("mixed Japanese and Latin"))).toBe(true);
  });

  test("allows span with lang", () => {
    const body = '本文は <span lang="en">API endpoint</span> です。\n';
    expect(validateLangMixingWarnings(body, "ja")).toEqual([]);
  });

  test("flags invalid lang attribute", () => {
    const body = '<span lang="english">text</span>\n';
    expect(validateLangMixingWarnings(body, "ja").some((w) => w.includes("invalid lang"))).toBe(
      true,
    );
  });

  test("respects lang_mixing: false", () => {
    expect(
      validateLangMixingWarnings("API テスト\n", "ja", { lang_mixing: false }),
    ).toEqual([]);
  });
});