import { Buffer } from "node:buffer";
import { describe, expect, test } from "./_expect.ts";
import {
  buildFtsWebIndex,
  buildWebIndex,
  FTS_WEB_INDEX_SCHEMA_VERSION,
  INT8_SCALE,
  toSnippet,
  type WebIndex,
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

const meta = (dim = 2): Record<string, string> => ({
  dim: String(dim),
  model_id: "ruri-v3-30m",
  quant: "q8",
  model_sha256: "abc",
});

function threw(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function decode(idx: WebIndex): Int8Array {
  const buf = Buffer.from(idx.embeddings.vectors_b64, "base64");
  return new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

describe("toSnippet", () => {
  test("改行を空白に潰す", () => {
    expect(toSnippet("a\n\nb\tc")).toBe("a b c");
  });
});

describe("buildWebIndex", () => {
  test("url を sourceToUrl で解決する", () => {
    const idx = buildWebIndex(
      [row()],
      [[0.1, 0.2]],
      meta(2),
      () => "2025-01-01-hello.html",
    );
    expect(idx.chunks[0]!.url).toBe("2025-01-01-hello.html");
    expect(idx.embeddings.encoding).toBe("int8");
    expect(decode(idx)[0]).toBe(Math.round(0.1 * INT8_SCALE));
  });

  test("ベクトル無し行は除外する", () => {
    const idx = buildWebIndex([row(), row({ id: 2 })], [[0.1, 0.2], []], meta(2));
    expect(idx.chunks.length).toBe(1);
  });

  test("行数とベクトル数が不一致なら投げる", () => {
    expect(threw(() => buildWebIndex([row()], [[0.1, 0.2], [0.3, 0.4]], meta(2)))).toBe(true);
  });

  test("disclosure map で digital_source_type を付与する", () => {
    const map = new Map([
      [
        "article/hello.md",
        "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
      ],
    ]);
    const idx = buildWebIndex([row()], [[0.1, 0.2]], meta(2), () => "hello.html", {
      disclosureMap: map,
      machineReadable: true,
    });
    expect(idx.chunks[0]!.digital_source_type).toContain("trainedAlgorithmicMedia");
  });

  test("machine_readable: false では digital_source_type を付けない", () => {
    const map = new Map([
      [
        "article/hello.md",
        "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
      ],
    ]);
    const idx = buildWebIndex([row()], [[0.1, 0.2]], meta(2), () => "hello.html", {
      disclosureMap: map,
      machineReadable: false,
    });
    expect(idx.chunks[0]!.digital_source_type).toBe(undefined);
  });
});

describe("buildFtsWebIndex", () => {
  test("schema version 4 と digital_source_type", () => {
    const map = new Map([
      [
        "article/hello.md",
        "http://cv.iptc.org/newscodes/digitalsourcetype/humanEdits",
      ],
    ]);
    const idx = buildFtsWebIndex([row()], () => "hello.html", {
      disclosureMap: map,
    });
    expect(idx.schema_version).toBe(FTS_WEB_INDEX_SCHEMA_VERSION);
    expect(idx.chunks[0]!.digital_source_type).toContain("humanEdits");
  });
});