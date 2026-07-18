import { describe, expect, test } from "./_expect.ts";
import {
  SEARCH_DOC_TYPE_FACETS,
  SEARCH_SOURCE_FACETS,
  matchesSourceFacet,
  searchFacetOptionsHtml,
  searchSourceFacetOptionsHtml,
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

describe("searchSourceFacetOptionsHtml", () => {
  test("AI 生成 facet を含む", () => {
    const ja = searchSourceFacetOptionsHtml("ja");
    expect(ja).toContain("AI生成");
    expect(ja).toContain('value="ai-generated"');
    expect(SEARCH_SOURCE_FACETS.some((f) => f.value === "human")).toBe(true);
  });
});

describe("matchesSourceFacet", () => {
  const aiUri =
    "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
  const humanUri =
    "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture";

  test("空 facet は常に true", () => {
    expect(matchesSourceFacet(undefined, "")).toBe(true);
    expect(matchesSourceFacet(aiUri, "")).toBe(true);
  });

  test("ai-generated", () => {
    expect(matchesSourceFacet(aiUri, "ai-generated")).toBe(true);
    expect(matchesSourceFacet(humanUri, "ai-generated")).toBe(false);
    expect(matchesSourceFacet(undefined, "ai-generated")).toBe(false);
  });

  test("human / disclosed", () => {
    expect(matchesSourceFacet(humanUri, "human")).toBe(true);
    expect(matchesSourceFacet(aiUri, "human")).toBe(false);
    expect(matchesSourceFacet(aiUri, "disclosed")).toBe(true);
    expect(matchesSourceFacet(undefined, "disclosed")).toBe(false);
  });
});
