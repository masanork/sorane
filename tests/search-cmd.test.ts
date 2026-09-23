import { describe, expect, test } from "./_expect.ts";
import {
  parseSearchArgs,
  parseSearchQuery,
  resolveSearchBackend,
} from "../packages/cli/src/search-cmd.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseSearchQuery", () => {
  test("--type の値を query と誤認しない", () => {
    expect(parseSearchQuery(["--type", "article", "hello world"])).toBe("hello world");
  });

  test("先頭の query", () => {
    expect(parseSearchQuery(["find me", "--json", "--cwd", "/tmp"])).toBe("find me");
  });

  test("フラグのみは空", () => {
    expect(parseSearchQuery(["--json"])).toBe("");
  });

  test("--okfc の値を query と誤認しない", () => {
    expect(parseSearchQuery(["--okfc", "dist/okf/site.okfc", "hello"])).toBe("hello");
  });
});

describe("parseSearchArgs", () => {
  test("--out で index パスを上書き", () => {
    const args = parseSearchArgs([
      "q",
      "--cwd",
      "/tmp/site",
      "--out",
      "custom/index.db",
    ]);
    expect(args.backend.kind).toBe("index");
    expect(args.backend.path.endsWith("custom/index.db")).toBe(true);
    expect(args.query).toBe("q");
  });

  test("--index は --out と同義", () => {
    const args = parseSearchArgs(["q", "--cwd", "/tmp/site", "--index", "x.db"]);
    expect(args.backend.path.endsWith("x.db")).toBe(true);
  });
});

describe("resolveSearchBackend (U4)", () => {
  test("site.okfc があれば okfc を選ぶ", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-search-backend-"));
    try {
      mkdirSync(join(root, "dist/okf"), { recursive: true });
      writeFileSync(join(root, "dist/okf/site.okfc"), "x");
      const b = resolveSearchBackend(root, [], {
        outDir: "dist",
        defaultIndex: ".sorane/index.db",
      });
      expect(b.kind).toBe("okfc");
      expect(b.path.endsWith("okf/site.okfc")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--prefer-index は index を強制", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-search-backend-"));
    try {
      mkdirSync(join(root, "dist/okf"), { recursive: true });
      writeFileSync(join(root, "dist/okf/site.okfc"), "x");
      const b = resolveSearchBackend(root, ["--prefer-index"], {
        outDir: "dist",
        defaultIndex: ".sorane/index.db",
      });
      expect(b.kind).toBe("index");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--okfc は任意パス", () => {
    const b = resolveSearchBackend("/tmp/site", ["--okfc", "other/unit.okfc"], {
      outDir: "dist",
      defaultIndex: ".sorane/index.db",
    });
    expect(b.kind).toBe("okfc");
    expect(b.path.endsWith("other/unit.okfc")).toBe(true);
  });

  test("okfc が無ければ index", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-search-backend-"));
    try {
      const b = resolveSearchBackend(root, [], {
        outDir: "dist",
        defaultIndex: ".sorane/index.db",
      });
      expect(b.kind).toBe("index");
      expect(b.path.includes("index.db")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
