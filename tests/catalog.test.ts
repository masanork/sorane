import { describe, expect, test } from "./_expect.ts";
import { buildCatalogJsonLd } from "../packages/core/src/catalog.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("buildCatalogJsonLd", () => {
  test("DataCatalog JSON を組み立てる", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Hello", tags: ["demo"], description: "desc" },
      "body",
      "hello",
    );
    const json = buildCatalogJsonLd(
      [{ slug: "hello", url: "https://ex.dev/hello.html", concept }],
      "Site",
      "https://ex.dev",
    );
    expect(json).toContain("DataCatalog");
    expect(json).toContain("hello.md");
    expect(json).toContain("demo");
  });
});