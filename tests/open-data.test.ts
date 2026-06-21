import { describe, expect, test } from "./_expect.ts";
import {
  isKnownEuDataTheme,
  isKnownLicenseId,
  parseDistributions,
  parseEuDataThemeCode,
  parsePublisher,
  resolveDistributionUrl,
  resolveLicenseUrl,
  resolveMediaType,
  validateEuThemeWarnings,
} from "../packages/core/src/open-data.ts";

describe("parseEuDataThemeCode", () => {
  test("短コードと Publications Office URI", () => {
    expect(parseEuDataThemeCode("GOVE")).toBe("GOVE");
    expect(parseEuDataThemeCode("gove")).toBe("GOVE");
    expect(
      parseEuDataThemeCode(
        "http://publications.europa.eu/resource/authority/data-theme/ECON",
      ),
    ).toBe("ECON");
    expect(parseEuDataThemeCode("transport")).toBe(undefined);
  });
});

describe("validateEuThemeWarnings", () => {
  test("未知コードのみ警告、自由タグは許容", () => {
    expect(validateEuThemeWarnings("GOVE").length).toBe(0);
    expect(isKnownEuDataTheme("GOVE")).toBe(true);
    expect(validateEuThemeWarnings("ZZZZ").some((w) => w.includes("ZZZZ"))).toBe(true);
    expect(validateEuThemeWarnings("open-data").length).toBe(0);
  });
});

describe("isKnownLicenseId", () => {
  test("SPDX と HTTPS を認識", () => {
    expect(isKnownLicenseId("CC-BY-4.0")).toBe(true);
    expect(isKnownLicenseId("https://example.com/license")).toBe(true);
    expect(isKnownLicenseId("custom")).toBe(false);
  });
});

describe("resolveLicenseUrl", () => {
  test("SPDX 短コードを URL に解決する", () => {
    expect(resolveLicenseUrl("CC-BY-4.0")).toBe(
      "https://creativecommons.org/licenses/by/4.0/",
    );
    expect(resolveLicenseUrl("https://example.com/license")).toBe(
      "https://example.com/license",
    );
  });
});

describe("resolveMediaType", () => {
  test("format を MIME にマップする", () => {
    expect(resolveMediaType("csv")).toBe("text/csv");
    expect(resolveMediaType("application/json")).toBe("application/json");
    expect(resolveMediaType("custom")).toBe("custom");
  });
});

describe("parsePublisher", () => {
  test("name 必須の publisher を読む", () => {
    expect(parsePublisher({ name: "Org", url: "https://ex.dev" })).toEqual({
      name: "Org",
      url: "https://ex.dev",
    });
    expect(parsePublisher({ url: "https://ex.dev" })).toBe(undefined);
  });
});

describe("parseDistributions", () => {
  test("有効な distribution のみ返す", () => {
    const dists = parseDistributions([
      { title: "CSV", format: "csv", accessURL: "/data.csv", byteSize: 1024 },
      { title: "", format: "csv", accessURL: "/bad.csv" },
      "not-an-object",
    ]);
    expect(dists.length).toBe(1);
    expect(dists[0]!.title).toBe("CSV");
    expect(dists[0]!.byteSize).toBe(1024);
  });
});

describe("resolveDistributionUrl", () => {
  test("相対・絶対 URL を解決する", () => {
    expect(resolveDistributionUrl("https://cdn.dev/a.csv", "", "https://ex.dev/p.html")).toBe(
      "https://cdn.dev/a.csv",
    );
    expect(resolveDistributionUrl("/static/a.csv", "https://ex.dev", "https://ex.dev/p.html")).toBe(
      "https://ex.dev/static/a.csv",
    );
    expect(resolveDistributionUrl("data/a.csv", "", "https://ex.dev/dataset.html")).toBe(
      "https://ex.dev/data/a.csv",
    );
  });
});