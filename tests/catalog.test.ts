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

  test("digitalSourceType を Dataset に含める", () => {
    const concept = normalizeConcept(
      {
        type: "article",
        title: "AI Post",
        profile: "sorane-okf/0.2",
        digitalSourceType: "trainedAlgorithmicMedia",
      },
      "body",
      "ai-post",
    );
    const json = buildCatalogJsonLd(
      [{ slug: "ai-post", url: "https://ex.dev/ai-post.html", concept }],
      "Site",
      "https://ex.dev",
    );
    expect(json).toContain("trainedAlgorithmicMedia");
  });

  test("machine_readable: false では digitalSourceType を出さない", () => {
    const concept = normalizeConcept(
      {
        type: "article",
        title: "AI Post",
        digitalSourceType: "trainedAlgorithmicMedia",
      },
      "body",
      "ai-post",
    );
    const json = buildCatalogJsonLd(
      [{ slug: "ai-post", url: "https://ex.dev/ai-post.html", concept }],
      "Site",
      "https://ex.dev",
      { machineReadable: false },
    );
    expect(json.includes("digitalSourceType")).toBe(false);
  });
});