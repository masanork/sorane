import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildFtsQuery,
  buildSearchIndex,
  checkModelMismatch,
  chunkDocument,
  makeSnippet,
  IndexStore,
  planIncremental,
  rrfFuse,
  RRF_K,
  search,
  searchFts,
  searchHybrid,
} from "../packages/search/src/index.ts";

describe("buildFtsQuery", () => {
  test("助詞混じりクエリを OR フレーズに分解", () => {
    expect(buildFtsQuery("バッチ処理の標準仕様")).toBe('"バッチ処理" OR "標準仕様"');
  });
});

describe("rrfFuse", () => {
  test("複数ランキングを融合する", () => {
    const fused = rrfFuse([
      [10, 20, 30],
      [20, 10, 40],
    ]);
    expect(fused.get(10)! > fused.get(30)!).toBe(true);
    expect(fused.get(20)! > fused.get(40)!).toBe(true);
  });

  test("空入力は空 map", () => {
    expect(rrfFuse([]).size).toBe(0);
    const score = rrfFuse([[7]], RRF_K).get(7)!;
    expect(Math.abs(score - 1 / (RRF_K + 1)) < 1e-9).toBe(true);
  });
});

describe("makeSnippet", () => {
  test("長文を省略する", () => {
    const text = "あ".repeat(200);
    expect(makeSnippet(text, "", 40).length <= 41).toBe(true);
  });

  test("クエリ位置を中心に抜粋する", () => {
    const text = "あ".repeat(50) + "needle" + "い".repeat(50);
    const snip = makeSnippet(text, "needle", 30);
    expect(snip.includes("needle")).toBe(true);
  });
});

describe("checkModelMismatch", () => {
  test("不一致を報告する", () => {
    expect(checkModelMismatch({ dim: "8", model_id: "a" }, "b", 4)).toContain("dim");
    expect(checkModelMismatch({ dim: "4", model_id: "x" }, "x", 4)).toBe(null);
  });
});

describe("planIncremental", () => {
  test("追加・変更・削除を分類", () => {
    const disk = new Map([
      ["a.md", "hash-a"],
      ["b.md", "hash-b2"],
    ]);
    const indexed = new Map([
      ["b.md", "hash-b1"],
      ["c.md", "hash-c"],
    ]);
    const plan = planIncremental(disk, indexed);
    expect(plan.added).toEqual(["a.md"]);
    expect(plan.changed).toEqual(["b.md"]);
    expect(plan.removed).toEqual(["c.md"]);
    expect(plan.unchanged).toEqual([]);
  });
});

describe("chunkDocument", () => {
  test("article をチャンク化する", () => {
    const source = `---
type: article
title: Hello
tags: [sorane]
---
Intro paragraph with enough text to pass the minimum chunk size threshold for indexing.

## Section One

More body text here that also exceeds the minimum chunk size for reliable search indexing.
`;
    const chunks = chunkDocument(source, "hello.md");
    expect(chunks.length >= 2).toBe(true);
    expect(chunks[0]!.docType).toBe("article");
    expect(chunks[0]!.tags).toBe("sorane");
  });

  test("isSystem は索引から除外", () => {
    const source = `---
type: article
title: System
isSystem: true
---
This system page should never appear in the search index even with a long enough body.
`;
    expect(chunkDocument(source, "profile.md").length).toBe(0);
  });
});

describe("index + search integration", () => {
  test("FTS でヒットする", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-search-"));
    const contentDir = join(dir, "content");
    const indexPath = join(dir, "index.db");
    try {
      mkdirSync(contentDir, { recursive: true });
      writeFileSync(
        join(contentDir, "post.md"),
        `---
type: article
title: Sorane Search
tags: [demo]
---
Sorane provides OKF-native static site generation for blogs and articles.

## Search Features

Full-text search uses SQLite FTS5 trigram tokenization for Japanese partial matching.
`,

      );

      const mockEmbeddings = {
        dimensions: 4,
        modelId: "test",
        quant: "q8",
        modelSha256: "",
        embed: async () => [1, 0, 0, 0],
        embedBatch: async (texts: string[]) => texts.map(() => [1, 0, 0, 0]),
      };

      const built = await buildSearchIndex({
        contentDir,
        indexPath,
        force: true,
        embeddings: mockEmbeddings,
      });
      expect(built.chunks > 0).toBe(true);
      expect(built.chunks).toBe(built.fts);
      expect(built.chunks).toBe(built.vec);
      expect(built.mode).toBe("hybrid");

      const store = new IndexStore(indexPath);
      const hits = searchFts(store, "FTS5 trigram", { k: 5 });

      expect(hits.length > 0).toBe(true);
      expect(hits[0]!.title).toBe("Sorane Search");
      expect(hits[0]!.snippet.includes("FTS5") || hits[0]!.text.includes("FTS5")).toBe(true);

      const hybrid = await searchHybrid(store, mockEmbeddings, "trigram", { k: 3 });
      expect(hybrid.length > 0).toBe(true);

      const routed = await search(store, mockEmbeddings, "trigram", { k: 3 });
      expect(routed.length > 0).toBe(true);

      const ftsOnly = await search(store, null, "trigram", { k: 3, ftsOnly: true });
      expect(ftsOnly.length > 0).toBe(true);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});