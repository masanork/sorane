import { describe, expect, test } from "./_expect.ts";
import {
  buildCatalogJsonLd,
  buildDatasetPageJsonLd,
} from "../packages/core/src/catalog.ts";
import type { TranslationEntry } from "../packages/core/src/i18n.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

function translationEntry(
  title: string,
  outRel: string,
  lang: string,
  localeId: string,
): TranslationEntry {
  return {
    parsed: {
      concept: normalizeConcept({ type: "article", title }, "body", "page"),
      file: "page.md",
      relPath: outRel.replace(/\.html$/i, ".md"),
      validation: { file: "page.md", ok: true, warnings: [], issues: [], type: "article" },
    },
    outRel,
    lang,
    localeId,
  };
}

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

  test("workTranslation を多言語 sibling に付与する", () => {
    const concept = normalizeConcept({ type: "article", title: "About" }, "body", "about");
    const translationMap = new Map<string, Map<string, TranslationEntry>>([
      [
        "path:about",
        new Map([
          ["ja", translationEntry("About", "about.html", "ja", "ja")],
          ["en", translationEntry("About EN", "en/about.html", "en", "en")],
        ]),
      ],
    ]);
    const json = buildCatalogJsonLd(
      [
        {
          slug: "about",
          url: "https://ex.dev/about.html",
          concept,
          localeId: "ja",
          groupKey: "path:about",
          lang: "ja",
        },
      ],
      "Site",
      "https://ex.dev",
      { translationMap },
    );
    const node = (JSON.parse(json) as { hasPart: Record<string, unknown>[] }).hasPart[0]!;
    expect(node.inLanguage).toBe("ja");
    expect(Array.isArray(node.workTranslation)).toBe(true);
    expect((node.workTranslation as { inLanguage: string }[])[0]!.inLanguage).toBe("en");
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