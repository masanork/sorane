import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildFtsQuery,
  buildSearchIndex,
  chunkDocument,
  makeSnippet,
  IndexStore,
  planIncremental,
  rrfFuse,
  RRF_K,
  searchFts,
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

      const built = await buildSearchIndex({ contentDir, indexPath, force: true });
      expect(built.chunks > 0).toBe(true);
      expect(built.chunks).toBe(built.fts);
      expect(built.mode).toBe("fts-only");

      const store = new IndexStore(indexPath);
      const hits = searchFts(store, "FTS5 trigram", { k: 5 });
      store.close();

      expect(hits.length > 0).toBe(true);
      expect(hits[0]!.title).toBe("Sorane Search");
      expect(hits[0]!.snippet.includes("FTS5") || hits[0]!.text.includes("FTS5")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});