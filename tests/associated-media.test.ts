import { describe, expect, test } from "./_expect.ts";
import {
  associatedMediaJsonLdFields,
  buildAssociatedMediaForArticle,
} from "../packages/core/src/associated-media.ts";
import type { MarkdownImageRef } from "../packages/core/src/markdown-image-refs.ts";

describe("buildAssociatedMediaForArticle", () => {
  test("provenance がある画像だけ associatedMedia に含める", () => {
    const ref: MarkdownImageRef = {
      markdownPath: "../static/hero.png",
      sourceMdRel: "post.md",
      srcAbs: "/tmp/hero.png",
      kind: "static",
      publicPath: "static/hero.png",
      outRel: "static/hero.png",
      alt: "Hero",
    };
    const items = buildAssociatedMediaForArticle({
      refs: [ref],
      provenance: {
        "../static/hero.png": { digitalSourceType: "trainedAlgorithmicMedia" },
      },
      baseUrl: "https://ex.dev",
    });
    expect(items.length).toBe(1);
    expect(items[0]!.contentUrl).toBe("https://ex.dev/static/hero.png");
    expect(items[0]!.digitalSourceType).toContain("trainedAlgorithmicMedia");
    expect(items[0]!.name).toBe("Hero");
  });
});

describe("associatedMediaJsonLdFields", () => {
  test("ImageObject 配列を返す", () => {
    const fields = associatedMediaJsonLdFields([
      {
        contentUrl: "https://ex.dev/static/a.png",
        digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
      },
    ]);
    expect(Array.isArray(fields?.associatedMedia)).toBe(true);
    const media = fields!.associatedMedia as Array<Record<string, unknown>>;
    expect(media[0]!["@type"]).toBe("ImageObject");
  });
});