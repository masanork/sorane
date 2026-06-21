import { describe, expect, test } from "./_expect.ts";
import {
  buildBreadcrumbJsonLd,
  buildWebSiteJsonLd,
  creativeWorkFindabilityFields,
  llmsContactSection,
  resolveSitemapLastmod,
} from "../packages/core/src/findability.ts";
import { buildCreativeWorkJsonLd } from "../packages/core/src/ssg.ts";
import { buildRobotsTxt } from "../packages/core/src/site-meta.ts";

describe("resolveSitemapLastmod", () => {
  test("updated が新しければ updated", () => {
    expect(resolveSitemapLastmod("2025-01-01", "2025-06-01")).toBe("2025-06-01");
  });

  test("timestamp のみ", () => {
    expect(resolveSitemapLastmod("2025-03-15T12:00:00Z", undefined)).toBe("2025-03-15");
  });
});

describe("buildWebSiteJsonLd", () => {
  test("GovernmentOrganization と SearchAction", () => {
    const html = buildWebSiteJsonLd({
      title: "Site",
      url: "https://ex.dev",
      lang: "ja",
      organization: {
        name: "Example Agency",
        url: "https://www.example.go.jp/",
        type: "GovernmentOrganization",
      },
      searchUrl: "https://ex.dev/search.html",
    });
    expect(html).toContain("GovernmentOrganization");
    expect(html).toContain("SearchAction");
    expect(html).toContain("search.html?q={search_term_string}");
  });

  test("license を WebSite JSON-LD に付与", () => {
    const html = buildWebSiteJsonLd({
      title: "Site",
      url: "https://ex.dev",
      lang: "ja",
      licenseUrl: "https://opensource.org/license/mit",
    });
    expect(html).toContain('"license":"https://opensource.org/license/mit"');
  });
});

describe("buildBreadcrumbJsonLd", () => {
  test("2 段パンくず", () => {
    const html = buildBreadcrumbJsonLd({
      items: [
        { name: "Home", url: "https://ex.dev/index.html" },
        { name: "Doc", url: "https://ex.dev/doc.html" },
      ],
    });
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain('"position":2');
  });
});

describe("creativeWorkFindabilityFields", () => {
  test("identifier / subject / audience / coverage", () => {
    const fields = creativeWorkFindabilityFields({
      identifier: "GOV-2025-001",
      subject: "統計",
      audience: "一般",
      coverage: "東京都",
    });
    expect(fields.identifier).toBe("GOV-2025-001");
    expect((fields.about as { name: string }).name).toBe("統計");
    expect((fields.audience as { audienceType: string }).audienceType).toBe("一般");
    expect(fields.spatialCoverage).toBe("東京都");
  });
});

describe("buildCreativeWorkJsonLd publisher", () => {
  test("organization を publisher に付与", () => {
    const html = buildCreativeWorkJsonLd({
      workType: "TechArticle",
      title: "T",
      url: "https://ex.dev/t.html",
      siteTitle: "S",
      lang: "ja",
      organization: { name: "Org", type: "GovernmentOrganization" },
      frontmatter: { identifier: "ID-1" },
    });
    expect(html).toContain("GovernmentOrganization");
    expect(html).toContain("ID-1");
  });
});

describe("buildRobotsTxt disallow", () => {
  test("Disallow 行を追加", () => {
    const txt = buildRobotsTxt("https://ex.dev", { disallow: ["/private/"] });
    expect(txt).toContain("Disallow: /private/");
  });
});

describe("llmsContactSection", () => {
  test("Publisher と Contact", () => {
    const block = llmsContactSection({
      baseUrl: "https://ex.dev",
      organization: { name: "Agency", type: "GovernmentOrganization", url: "https://a.dev" },
      contact: { page: "contact.html", email: "info@example.go.jp" },
    }).join("\n");
    expect(block).toContain("## Publisher");
    expect(block).toContain("GovernmentOrganization");
    expect(block).toContain("## Contact");
    expect(block).toContain("info@example.go.jp");
  });
});