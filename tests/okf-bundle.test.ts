import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "./_expect.ts";
import { buildBundleEntries, buildOkfBundle } from "../packages/okf/src/bundle.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";
import { parseYaml, dumpYaml } from "../packages/okf/src/yaml.ts";

describe("buildBundleEntries", () => {
  test("type/slug 順に並べる", () => {
    const a = normalizeConcept({ type: "article", title: "B" }, "b", "b");
    const z = normalizeConcept({ type: "index", title: "A" }, "a", "index");
    const entries = buildBundleEntries([
      { concept: a, slug: "b" },
      { concept: z, slug: "index" },
    ]);
    expect(entries[0]!.path).toBe("article/b.md");
    expect(entries[0]!.content).toContain("type: article");
    expect(entries[1]!.path).toBe("index/index.md");
    expect(entries[1]!.content).toContain("type: index");
  });
});

describe("buildOkfBundle", () => {
  test("100 文字超パスは拒否", async () => {
    const concept = normalizeConcept({ type: "article", title: "T" }, "body", "t");
    const longSlug = "a".repeat(95);
    let threw = false;
    try {
      await buildOkfBundle([{ concept, slug: longSlug }]);
    } catch (e) {
      threw = e instanceof Error && /tar name limit/.test(e.message);
    }
    expect(threw).toBe(true);
  });

  test("gzip 圧縮 tar を返す", async () => {
    const concept = normalizeConcept({ type: "article", title: "T" }, "body", "t");
    const buf = await buildOkfBundle([{ concept, slug: "t" }]);
    const tar = gunzipSync(buf);
    expect(tar.length > 512).toBe(true);
    expect(tar.subarray(0, 100).toString("utf8")).toContain("article/t.md");
  });
});

describe("yaml", () => {
  test("parse と dump の往復", () => {
    const doc = { type: "article", title: "T", count: 1 };
    const yaml = dumpYaml(doc);
    const parsed = parseYaml(yaml) as Record<string, unknown>;
    expect(parsed.title).toBe("T");
    expect(parsed.count).toBe(1);
  });
});