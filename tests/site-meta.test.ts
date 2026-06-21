import { describe, expect, test } from "./_expect.ts";
import {
  buildAtomFeed,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
} from "../packages/core/src/site-meta.ts";

describe("buildRobotsTxt", () => {
  test("base_url ありで Sitemap 行を出す", () => {
    const txt = buildRobotsTxt("https://ex.dev");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Sitemap: https://ex.dev/sitemap.xml");
  });

  test("base_url 無しでは Sitemap 行を省略", () => {
    const txt = buildRobotsTxt("");
    expect(txt).not.toContain("Sitemap:");
  });
});

describe("buildSitemapXml", () => {
  test("エントリと XML エスケープ", () => {
    const xml = buildSitemapXml(
      [
        { url: "index.html", isIndex: true, lastmod: "2025-01-01" },
        { url: 'a&b"<>c.html', isIndex: false },
      ],
      "https://ex.dev",
    );
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<loc>https://ex.dev/index.html</loc>");
    expect(xml).toContain("<lastmod>2025-01-01</lastmod>");
    expect(xml).toContain("<priority>0.8</priority>");
    expect(xml).toContain("<priority>0.5</priority>");
    expect(xml).toContain("a&amp;b&quot;&lt;&gt;c.html");
  });

  test("base_url 無しは相対 loc", () => {
    const xml = buildSitemapXml([{ url: "page.html", isIndex: false }], "");
    expect(xml).toContain("<loc>page.html</loc>");
    expect(xml).not.toContain("https://");
  });
});

describe("buildAtomFeed", () => {
  test("空エントリでも feed を生成", () => {
    const xml = buildAtomFeed([], {
      siteTitle: "S",
      siteDescription: "D",
      baseUrl: "https://ex.dev",
    });
    expect(xml).toContain("<feed");
    expect(xml).toContain("<updated>");
    expect(xml).not.toContain("<entry>");
  });

  test("summary と feedPath を反映", () => {
    const xml = buildAtomFeed(
      [
        {
          title: "T",
          url: "https://ex.dev/a.html",
          id: "id",
          updated: "2025-06-01T00:00:00Z",
          summary: 'lead & "quote"',
        },
      ],
      {
        siteTitle: "S",
        siteDescription: "D",
        baseUrl: "https://ex.dev",
        feedPath: "custom.xml",
      },
    );
    expect(xml).toContain("custom.xml");
    expect(xml).toContain("<summary>lead &amp; &quot;quote&quot;</summary>");
  });
});

describe("buildLlmsTxt", () => {
  test("基本セクション", () => {
    const txt = buildLlmsTxt({
      siteTitle: "Site",
      siteDescription: "Desc",
      baseUrl: "https://ex.dev",
    });
    expect(txt).toContain("# Site");
    expect(txt).toContain("> Desc");
    expect(txt).toContain("okf/bundle.tar.gz");
    expect(txt).toContain("catalog.jsonld");
  });

  test("aiLabeledCount 0 では AI セクションを出さない", () => {
    const txt = buildLlmsTxt({
      siteTitle: "S",
      siteDescription: "D",
      baseUrl: "",
      aiLabeledCount: 0,
    });
    expect(txt).not.toContain("## AI content disclosure");
  });
});