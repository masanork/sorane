import { describe, expect, test } from "./_expect.ts";
import {
  SEARCH_DOC_TYPE_FACETS,
  searchFacetOptionsHtml,
} from "../packages/core/src/search-facets.ts";

describe("searchFacetOptionsHtml", () => {
  test("OKF 0.3 型をファセットに含む", () => {
    const ja = searchFacetOptionsHtml("ja");
    expect(ja).toContain('value="dataset"');
    expect(ja).toContain("データセット");
    expect(ja).toContain('value="faq"');

    const en = searchFacetOptionsHtml("en");
    expect(en).toContain("Datasets");
    expect(en).toContain("Glossary");
    expect(SEARCH_DOC_TYPE_FACETS.some((f) => f.value === "reference")).toBe(true);
  });
});