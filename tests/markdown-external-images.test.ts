import { describe, expect, test } from "./_expect.ts";
import { extractExternalMarkdownImages } from "../packages/core/src/markdown-external-images.ts";
import { buildAssociatedMediaForArticle } from "../packages/core/src/associated-media.ts";

describe("extractExternalMarkdownImages", () => {
  test("http(s) と // を抽出する", () => {
    const refs = extractExternalMarkdownImages(
      `![a](https://cdn.example/x.png)\n![b](//cdn.example/y.jpg)\n![local](../static/z.png)`,
    );
    expect(refs.length).toBe(2);
    expect(refs[0]!.url).toBe("https://cdn.example/x.png");
    expect(refs[0]!.alt).toBe("a");
    expect(refs[1]!.url).toBe("https://cdn.example/y.jpg");
  });

  test("重複 URL は一度だけ", () => {
    const refs = extractExternalMarkdownImages(
      `![](https://ex/a.png)\n![](https://ex/a.png)`,
    );
    expect(refs.length).toBe(1);
  });
});

describe("buildAssociatedMediaForArticle external", () => {
  test("provenance キーが URL の hotlink を associatedMedia に含める", () => {
    const items = buildAssociatedMediaForArticle({
      refs: [],
      externalRefs: [{ url: "https://cdn.example/gen.png", alt: "Gen" }],
      provenance: {
        "https://cdn.example/gen.png": {
          digitalSourceType: "trainedAlgorithmicMedia",
        },
      },
      baseUrl: "https://site.example",
    });
    expect(items.length).toBe(1);
    expect(items[0]!.contentUrl).toBe("https://cdn.example/gen.png");
    expect(items[0]!.digitalSourceType).toContain("trainedAlgorithmicMedia");
    expect(items[0]!.name).toBe("Gen");
    expect(items[0]!.encodingFormat).toBe("image/png");
  });

  test("provenance が無い hotlink は除外", () => {
    const items = buildAssociatedMediaForArticle({
      refs: [],
      externalRefs: [{ url: "https://cdn.example/plain.png", alt: "" }],
      provenance: {},
      baseUrl: "",
    });
    expect(items.length).toBe(0);
  });
});
