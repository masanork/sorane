import { describe, expect, test } from "./_expect.ts";
import { buildCatalogDcatJsonLd } from "../packages/core/src/catalog-dcat.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

function datasetConcept() {
  return normalizeConcept(
    {
      type: "dataset",
      title: "Transit CSV",
      description: "Bus stops",
      resource: "https://ex.dev/data/transit",
      license: "CC-BY-4.0",
      profile: "sorane-okf/0.3",
      identifier: "https://ex.dev/id/transit",
      language: "ja",
      theme: "transport",
      timestamp: "2026-01-01T00:00:00Z",
      publisher: { name: "Example Org", url: "https://ex.dev", email: "data@ex.dev" },
      distributions: [
        {
          title: "CSV",
          format: "csv",
          accessURL: "/static/transit.csv",
          byteSize: 1024,
          checksum: "sha256:abc",
        },
      ],
      tags: ["open-data"],
    },
    "body",
    "transit",
  );
}

describe("buildCatalogDcatJsonLd", () => {
  test("dcat:Catalog と dcat:dataset を出力", () => {
    const json = buildCatalogDcatJsonLd(
      [{ slug: "transit", url: "https://ex.dev/transit.html", concept: datasetConcept() }],
      "Open Data Site",
      "https://ex.dev",
      {
        siteDescription: "Demo catalogue",
        publisher: { name: "Gov", url: "https://ex.dev", type: "GovernmentOrganization" },
      },
    );
    expect(json).not.toBe(null);
    const parsed = JSON.parse(json!) as Record<string, unknown>;
    expect(parsed["@type"]).toBe("dcat:Catalog");
    expect(parsed["dct:title"]).toBe("Open Data Site");
    const datasets = parsed["dcat:dataset"] as Record<string, unknown>[];
    expect(datasets.length).toBe(1);
    expect(datasets[0]!["@type"]).toBe("dcat:Dataset");
    expect(datasets[0]!["dct:title"]).toBe("Transit CSV");
    expect(json).toContain("dcat:Distribution");
    expect(json).toContain("foaf:Agent");
    expect(json).toContain("text/csv");
    expect(json).toContain("creativecommons.org");
  });

  test("dataset が無いとき null", () => {
    const article = normalizeConcept(
      { type: "article", title: "Post", profile: "sorane-okf/0.3" },
      "body",
      "post",
    );
    const json = buildCatalogDcatJsonLd(
      [{ slug: "post", url: "https://ex.dev/post.html", concept: article }],
      "Site",
      "https://ex.dev",
    );
    expect(json).toBe(null);
  });

  test("default_license を dataset に適用", () => {
    const concept = normalizeConcept(
      {
        type: "dataset",
        title: "No License Field",
        description: "x",
        resource: "https://ex.dev/d",
        profile: "sorane-okf/0.3",
        publisher: { name: "Org" },
        distributions: [{ title: "CSV", format: "csv", accessURL: "a.csv" }],
      },
      "body",
      "d",
    );
    const json = buildCatalogDcatJsonLd(
      [{ slug: "d", url: "https://ex.dev/d.html", concept }],
      "Site",
      "https://ex.dev",
      { defaultLicense: "CC0-1.0" },
    );
    expect(json).toContain("publicdomain/zero/1.0");
  });
});