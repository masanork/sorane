import { describe, expect, test } from "./_expect.ts";
import {
  renderDatasetPageBody,
  validateDatasetWarnings,
} from "../packages/core/src/dataset-page.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("validateDatasetWarnings", () => {
  test("未知 EU theme コードを警告", () => {
    const warnings = validateDatasetWarnings({
      theme: "ZZZZ",
      license: "CC-BY-4.0",
      distributions: [],
    });
    expect(warnings.some((w) => w.includes("unknown EU data-theme"))).toBe(true);
    const ok = validateDatasetWarnings({
      theme: "GOVE",
      license: "CC-BY-4.0",
      publisher: { name: "Org" },
    });
    expect(ok.some((w) => w.includes("data-theme"))).toBe(false);
  });

  test("未知ライセンスと http distribution を警告", () => {
    const warnings = validateDatasetWarnings({
      license: "Custom-License",
      distributions: [{ title: "CSV", format: "csv", accessURL: "http://ex.dev/data.csv" }],
    });
    expect(warnings.some((w) => w.includes("unknown license"))).toBe(true);
    expect(warnings.some((w) => w.includes("http://"))).toBe(true);
  });
});

describe("renderDatasetPageBody", () => {
  test("メタデータと distribution テーブル", () => {
    const concept = normalizeConcept(
      {
        type: "dataset",
        title: "Transit",
        profile: "sorane-okf/0.3",
        license: "CC-BY-4.0",
        identifier: "ds-1",
        language: "ja",
        theme: "transport",
        resource: "https://ex.dev/data",
        publisher: { name: "Org", url: "https://ex.dev" },
        distributions: [
          { title: "Tiny", format: "json", accessURL: "tiny.json", byteSize: 512 },
          { title: "CSV", format: "csv", accessURL: "data.csv", byteSize: 2048, checksum: "sha256:abc" },
        ],
      },
      "<p>Body</p>",
      "transit",
    );
    const html = renderDatasetPageBody(concept, "<p>Rendered</p>", {
      pageUrl: "https://ex.dev/transit.html",
      baseUrl: "https://ex.dev",
    });
    expect(html).toContain("dataset-meta");
    expect(html).toContain("CC-BY-4.0");
    expect(html).toContain("Org");
    expect(html).toContain("ds-1");
    expect(html).toContain("transport");
    expect(html).toContain("512 B");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("sha256:abc");
    expect(html).toContain("dataset-distributions");
    expect(html).toContain("<p>Rendered</p>");
  });

  test("distribution 無しはテーブルを省略", () => {
    const concept = normalizeConcept(
      { type: "dataset", title: "Empty", profile: "sorane-okf/0.3" },
      "body",
      "empty",
    );
    const html = renderDatasetPageBody(concept, "<p>x</p>", {
      pageUrl: "https://ex.dev/empty.html",
      baseUrl: "",
    });
    expect(html).not.toContain("dataset-distributions");
    expect(html).toContain("dataset-body");
  });
});