import { describe, expect, test } from "./_expect.ts";
import {
  llmsLicenseSection,
  resolveCopyrightNotice,
  resolveSiteLicense,
  siteLicenseFooterMeta,
} from "../packages/core/src/site-license.ts";

describe("resolveCopyrightNotice", () => {
  test("copyright_since と holder で範囲を組み立て", () => {
    expect(
      resolveCopyrightNotice(
        { copyright_since: 2023, copyright_holder: "Example" },
        2026,
      ),
    ).toBe("2023–2026 Example");
  });

  test("初出年とビルド年が同じなら単年", () => {
    expect(
      resolveCopyrightNotice(
        { copyright_since: 2026, copyright_holder: "Example" },
        2026,
      ),
    ).toBe("2026 Example");
  });

  test("copyright があれば since/holder より優先", () => {
    expect(
      resolveCopyrightNotice(
        {
          copyright: "Custom notice",
          copyright_since: 2023,
          copyright_holder: "Ignored",
        },
        2026,
      ),
    ).toBe("Custom notice");
  });

  test("holder のみ", () => {
    expect(resolveCopyrightNotice({ copyright_holder: "Solo" }, 2026)).toBe("Solo");
  });
});

describe("resolveSiteLicense", () => {
  test("SPDX id を解決", () => {
    const lic = resolveSiteLicense(
      {
        license: "MIT",
        license_page: "license.html",
        copyright_since: 2023,
        copyright_holder: "Example",
      },
      2026,
    );
    expect(lic?.id).toBe("MIT");
    expect(lic?.url).toBe("https://opensource.org/license/mit");
    expect(lic?.page).toBe("license.html");
    expect(lic?.copyright).toBe("2023–2026 Example");
  });

  test("license 未設定は undefined", () => {
    expect(resolveSiteLicense({})).toBe(undefined);
  });
});

describe("siteLicenseFooterMeta", () => {
  test("license_page と copyright", () => {
    const html = siteLicenseFooterMeta(
      {
        id: "MIT",
        url: "https://opensource.org/license/mit",
        page: "license.html",
        copyright: "2023 Example",
      },
      "../",
    );
    expect(html).toContain('rel="license"');
    expect(html).toContain("../license.html");
    expect(html).toContain("MIT");
    expect(html).toContain("© 2023 Example");
  });
});

describe("llmsLicenseSection", () => {
  test("License セクション", () => {
    const lines = llmsLicenseSection(
      {
        id: "MIT",
        url: "https://opensource.org/license/mit",
        page: "license.html",
      },
      "https://sorane.dev",
    );
    expect(lines.join("\n")).toContain("## License");
    expect(lines.join("\n")).toContain("https://sorane.dev/license.html");
  });
});