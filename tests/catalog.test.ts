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
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed["@type"]).toBe("DataCatalog");
    expect(parsed.dataset).toBe(undefined);
    expect(Array.isArray(parsed.hasPart)).toBe(true);
    expect((parsed.hasPart as { name: string }[])[0]!.name).toBe("Hello");
    expect(json).toContain("hello.md");
    expect(json).toContain("demo");
    expect(json).toContain("BlogPosting");
  });

  test("dataset は catalog.dataset、記事は hasPart に分離する", () => {
    const article = normalizeConcept(
      { type: "article", title: "Post", profile: "sorane-okf/0.3" },
      "body",
      "post",
    );
    const dataset = normalizeConcept(
      {
        type: "dataset",
        title: "Transit CSV",
        description: "Sample open data",
        resource: "https://ex.dev/data/transit",
        license: "CC-BY-4.0",
        profile: "sorane-okf/0.3",
        publisher: { name: "Example Org", url: "https://ex.dev" },
        distributions: [
          { title: "CSV", format: "csv", accessURL: "/static/transit.csv" },
        ],
      },
      "body",
      "transit",
    );
    const json = buildCatalogJsonLd(
      [
        { slug: "post", url: "https://ex.dev/post.html", concept: article },
        { slug: "transit", url: "https://ex.dev/transit.html", concept: dataset },
      ],
      "Site",
      "https://ex.dev",
    );
    const parsed = JSON.parse(json) as {
      dataset?: { "@type": string; name: string }[];
      hasPart?: { "@type": string; name: string }[];
    };
    expect(parsed.dataset?.length).toBe(1);
    expect(parsed.dataset![0]!["@type"]).toBe("Dataset");
    expect(parsed.dataset![0]!.name).toBe("Transit CSV");
    expect(parsed.hasPart?.length).toBe(1);
    expect(parsed.hasPart![0]!["@type"]).toBe("BlogPosting");
    expect(parsed.hasPart![0]!.name).toBe("Post");
    expect(json).not.toContain('"hasPart": [\n    {\n      "@type": "Dataset"');
  });

  test("docsMode では article を TechArticle にする", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Guide", profile: "sorane-okf/0.3" },
      "body",
      "guide",
    );
    const json = buildCatalogJsonLd(
      [{ slug: "guide", url: "https://ex.dev/guide.html", concept }],
      "Site",
      "https://ex.dev",
      { docsMode: true },
    );
    expect(json).toContain("TechArticle");
    expect(json).not.toContain("BlogPosting");
  });

  test("reference / glossary / faq の JSON-LD 型", () => {
    const reference = normalizeConcept(
      { type: "reference", title: "API fields", profile: "sorane-okf/0.3" },
      "body",
      "api-fields",
    );
    const glossary = normalizeConcept(
      { type: "glossary", title: "Stats terms", profile: "sorane-okf/0.3" },
      "body",
      "stats",
    );
    const faq = normalizeConcept(
      { type: "faq", title: "FAQ", profile: "sorane-okf/0.3" },
      "body",
      "faq",
    );
    const json = buildCatalogJsonLd(
      [
        { slug: "api", url: "https://ex.dev/api.html", concept: reference },
        { slug: "stats", url: "https://ex.dev/stats.html", concept: glossary },
        { slug: "faq", url: "https://ex.dev/faq.html", concept: faq },
      ],
      "Site",
      "https://ex.dev",
    );
    expect(json).toContain('"@type": "TechArticle"');
    expect(json).toContain('"@type": "DefinedTermSet"');
    expect(json).toContain('"@type": "FAQPage"');
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