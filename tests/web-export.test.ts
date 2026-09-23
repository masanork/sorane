import { describe, expect, test } from "./_expect.ts";
import {
  buildFtsWebIndex,
  FTS_WEB_INDEX_SCHEMA_VERSION,
  toSnippet,
} from "../packages/search/src/web-export.ts";
import type { ChunkRow } from "../packages/search/src/store.ts";

const row = (over: Partial<ChunkRow> = {}): ChunkRow => ({
  id: 1,
  source: "article/hello.md",
  chunkIndex: 0,
  text: "本文テキスト",
  headingPath: "Hello / Section",
  headingSlug: "section",
  docType: "article",
  title: "Hello",
  timestamp: "2025-01-01T00:00:00Z",
  tags: "demo",
  ...over,
});

describe("toSnippet", () => {
  test("改行を空白に潰す", () => {
    expect(toSnippet("a\n\nb\tc")).toBe("a b c");
  });
});

describe("buildFtsWebIndex", () => {
  test("FTS schema と disclosure を出力する", () => {
    const map = new Map([
      ["article/hello.md", "http://cv.iptc.org/newscodes/digitalsourcetype/humanEdits"],
    ]);
    const idx = buildFtsWebIndex([row()], () => "hello.html", { disclosureMap: map });
    expect(idx.schema_version).toBe(FTS_WEB_INDEX_SCHEMA_VERSION);
    expect(idx.chunks[0]!.digital_source_type).toContain("humanEdits");
  });
});
