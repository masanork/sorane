import { describe, expect, test } from "./_expect.ts";
import {
  buildCatalogJsonLd,
  buildDatasetPageJsonLd,
} from "../packages/core/src/catalog.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("buildDatasetPageJsonLd", () => {
  test("Dataset script タグを生成", () => {
    const concept = normalizeConcept(
      {
        type: "dataset",
        title: "Stops",
        profile: "sorane-okf/0.3",
        license: "CC-BY-4.0",
        distributions: [{ title: "CSV", format: "csv", accessURL: "/data.csv" }],
      },
      "body",
      "stops",
    );
    const html = buildDatasetPageJsonLd(
      { slug: "stops", url: "https://ex.dev/stops.html", concept },
      true,
    );
    expect(html).toContain("<script");
    expect(html).toContain("Dataset");
    expect(html).toContain("DataDownload");
  });
});

describe("buildCatalogJsonLd publisher", () => {
  test("catalog publisher を含める", () => {
    const concept = normalizeConcept({ type: "article", title: "Post" }, "body", "post");
    const json = buildCatalogJsonLd(
      [{ slug: "post", url: "https://ex.dev/post.html", concept }],
      "Site",
      "https://ex.dev",
      { publisher: { name: "Org", url: "https://org.dev" } },
    );
    const parsed = JSON.parse(json) as { publisher?: { name: string } };
    expect(parsed.publisher?.name).toBe("Org");
  });

  test("index type は hasPart から除外", () => {
    const index = normalizeConcept({ type: "index", title: "Home" }, "body", "index");
    const json = buildCatalogJsonLd(
      [{ slug: "index", url: "https://ex.dev/index.html", concept: index }],
      "Site",
      "https://ex.dev",
    );
    const parsed = JSON.parse(json) as { hasPart?: unknown[] };
    expect(parsed.hasPart ?? []).toEqual([]);
  });
});