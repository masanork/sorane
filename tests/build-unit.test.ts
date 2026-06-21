import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, test } from "./_expect.ts";
import { tarBytes } from "../packages/core/src/build.ts";

describe("tarBytes", () => {
  test("単一エントリの tar ヘッダと本文", () => {
    const buf = tarBytes([{ path: "article/hello.md", content: "hello" }]);
    expect(buf.length > 512).toBe(true);
    expect(buf.subarray(0, 100).toString("ascii").replace(/\0/g, "")).toContain("article/hello.md");
    expect(buf.toString("utf8")).toContain("hello");
  });

  test("100 文字超のパスは拒否", () => {
    const longPath = "a".repeat(101);
    let threw = false;
    try {
      tarBytes([{ path: longPath, content: "x" }]);
    } catch (e) {
      threw = e instanceof Error && /tar name limit/.test(e.message);
    }
    expect(threw).toBe(true);
  });
});

describe("tarBytes gzip round-trip", () => {
  test("複数エントリを gzip して復元できる", () => {
    const entries = [
      { path: "index/index.md", content: "---\ntype: index\n---\n" },
      { path: "article/a.md", content: "body a" },
      { path: "article/b.md", content: "body b with padding" },
    ];
    const tar = tarBytes(entries);
    const restored = gunzipSync(gzipSync(tar));
    expect(restored.equals(tar)).toBe(true);
  });
});