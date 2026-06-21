import { describe, expect, test } from "./_expect.ts";
import {
  isDatasetCatalogEntry,
  resolveCatalogCreativeWorkType,
} from "../packages/core/src/creative-work-type.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("resolveCatalogCreativeWorkType", () => {
  test("reference / faq / glossary をマップする", () => {
    const ref = normalizeConcept({ type: "reference", title: "R", profile: "sorane-okf/0.3" }, "", "r");
    const faq = normalizeConcept({ type: "faq", title: "F", profile: "sorane-okf/0.3" }, "", "f");
    const gloss = normalizeConcept({ type: "glossary", title: "G", profile: "sorane-okf/0.3" }, "", "g");
    expect(resolveCatalogCreativeWorkType(ref, false)).toBe("TechArticle");
    expect(resolveCatalogCreativeWorkType(faq, false)).toBe("FAQPage");
    expect(resolveCatalogCreativeWorkType(gloss, false)).toBe("DefinedTermSet");
  });

  test("creativeWorkType オーバーライド", () => {
    const article = normalizeConcept(
      { type: "article", title: "A", profile: "sorane-okf/0.3", creativeWorkType: "TechArticle" },
      "",
      "a",
    );
    expect(resolveCatalogCreativeWorkType(article, false)).toBe("TechArticle");
  });

  test("docsMode で article は TechArticle、通常は BlogPosting", () => {
    const article = normalizeConcept({ type: "article", title: "A", profile: "sorane-okf/0.3" }, "", "a");
    expect(resolveCatalogCreativeWorkType(article, true)).toBe("TechArticle");
    expect(resolveCatalogCreativeWorkType(article, false)).toBe("BlogPosting");
  });
});

describe("isDatasetCatalogEntry", () => {
  test("dataset type を検出", () => {
    const ds = normalizeConcept({ type: "dataset", title: "D", profile: "sorane-okf/0.3" }, "", "d");
    const article = normalizeConcept({ type: "article", title: "A", profile: "sorane-okf/0.3" }, "", "a");
    expect(isDatasetCatalogEntry(ds)).toBe(true);
    expect(isDatasetCatalogEntry(article)).toBe(false);
  });
});