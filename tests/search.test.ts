import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildFtsQuery,
  buildSearchIndex,
  chunkDocument,
  deriveWebIndexFromChunks,
  makeSnippet,
  IndexStore,
  planIncremental,
  search,
  searchFts,
} from "../packages/search/src/index.ts";

describe("buildFtsQuery", () => {
  test("助詞混じりクエリを OR フレーズに分解", () => {
    expect(buildFtsQuery("バッチ処理の標準仕様")).toBe('"バッチ処理" OR "標準仕様"');
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

  test("faq を ## 単位で索引する", () => {
    const source = `---
type: faq
title: FAQ
---

## License?
CC-BY-4.0 applies.

## Download?
See the dataset page.
`;
    const chunks = chunkDocument(source, "faq.md");
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.docType).toBe("faq");
    expect(chunks[0]!.text.includes("License")).toBe(true);
  });

  test("faq はコードフェンス内の ## を質問境界にしない", () => {
    const source = `---
type: faq
title: FAQ
---

## Real question?

\`\`\`
## not a question
\`\`\`

Answer with enough text to exceed the structured minimum chunk size for indexing.
`;
    const chunks = chunkDocument(source, "faq-fence.md");
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.text.includes("not a question")).toBe(true);
  });

  test("glossary を ## 単位で索引する", () => {
    const source = `---
type: glossary
title: Terms
---

## CSV {#csv}
Comma-separated values.
`;
    const chunks = chunkDocument(source, "glossary.md");
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.text.includes("CSV")).toBe(true);
  });

  test("dataset はメタデータ概要チャンクを付与", () => {
    const source = `---
type: dataset
title: Transit
description: Bus stops.
license: CC-BY-4.0
theme: transport
distributions:
  - title: CSV
    format: csv
    accessURL: data.csv
---

Short body.
`;
    const chunks = chunkDocument(source, "transit.md");
    expect(chunks.length >= 1).toBe(true);
    expect(chunks[0]!.text.includes("Transit")).toBe(true);
    expect(chunks[0]!.text.includes("CC-BY-4.0")).toBe(true);
    expect(chunks[0]!.tags.includes("format:csv")).toBe(true);
    expect(chunks[0]!.tags.includes("license:cc-by-4.0")).toBe(true);
  });

  test("reference の GFM 表を索引する", () => {
    const source = `---
type: reference
title: Fields
---

| Column | Type |
|--------|------|
| stop_id | string |
| name | string |
`;
    const chunks = chunkDocument(source, "fields.md");
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.text.includes("stop_id")).toBe(true);
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

describe("open-data example indexing", () => {
  test("OKF 0.3 型を doc_type で検索できる", async () => {
    const contentDir = join(import.meta.dirname, "../examples/open-data/content");
    const dir = mkdtempSync(join(tmpdir(), "sorane-open-data-search-"));
    const indexPath = join(dir, "index.db");
    try {
      const built = await buildSearchIndex({
        contentDir,
        indexPath,
        force: true,
      });
      expect(built.chunks > 0).toBe(true);

      const store = new IndexStore(indexPath);
      const datasetHits = searchFts(store, "Transit", { filter: { docType: "dataset" }, k: 5 });
      expect(datasetHits.length > 0).toBe(true);

      const faqHits = searchFts(store, "license", { filter: { docType: "faq" }, k: 5 });
      expect(faqHits.length > 0).toBe(true);

      const refHits = searchFts(store, "stop_id", { filter: { docType: "reference" }, k: 5 });
      expect(refHits.length > 0).toBe(true);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

      const built = await buildSearchIndex({
        contentDir,
        indexPath,
        force: true,
      });
      expect(built.chunks > 0).toBe(true);
      expect(built.chunks).toBe(built.fts);

      const store = new IndexStore(indexPath);
      const hits = searchFts(store, "FTS5 trigram", { k: 5 });

      expect(hits.length > 0).toBe(true);
      expect(hits[0]!.title).toBe("Sorane Search");
      expect(hits[0]!.snippet.includes("FTS5") || hits[0]!.text.includes("FTS5")).toBe(true);

      const routed = search(store, "trigram", { k: 3 });
      expect(routed.length > 0).toBe(true);
      const rows = store.exportAll();
      store.close();

      const webIndexPath = join(dir, "search-index.json");
      const derived = deriveWebIndexFromChunks(rows, webIndexPath, () => "post.html");
      expect(derived.written).toBe(true);
      expect(derived.chunks > 0).toBe(true);
      expect(existsSync(webIndexPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("FTS のみでも web index を出す", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-search-"));
    const contentDir = join(dir, "content");
    const indexPath = join(dir, "index.db");
    try {
      mkdirSync(contentDir, { recursive: true });
      writeFileSync(
        join(contentDir, "doc.md"),
        `---
type: article
title: FTS Doc
---
Keyword matching works without embedding models in the browser search index export.
`,
      );

      const built = await buildSearchIndex({
        contentDir,
        indexPath,
        force: true,
      });

      const webIndexPath = join(dir, "search-index.json");
      const store = new IndexStore(indexPath);
      const rows = store.exportAll();
      store.close();
      const derived = deriveWebIndexFromChunks(rows, webIndexPath, () => "doc.html");
      expect(derived.written).toBe(true);
      expect(derived.chunks).toBe(built.chunks);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
