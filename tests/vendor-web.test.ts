import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  copySearchScript,
  readSearchScript,
  vendorRuntime,
} from "../packages/search/src/vendor-web.ts";

const repoRoot = join(import.meta.dirname, "..");

describe("vendor-web", () => {
  test("readSearchScript は search.mjs を読む", () => {
    const script = readSearchScript(repoRoot);
    expect(script.length > 0).toBe(true);
    expect(script.includes("search")).toBe(true);
  });

  test("copySearchScript は dist にコピーする", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-vendor-"));
    try {
      expect(copySearchScript(tmp, repoRoot)).toBe(true);
      expect(existsSync(join(tmp, "assets", "search.mjs"))).toBe(true);
      const copied = readFileSync(join(tmp, "assets", "search.mjs"), "utf8");
      expect(copied).toBe(readSearchScript(repoRoot));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("vendorRuntime は依存があれば lib をコピーする", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-vendor-"));
    try {
      const ok = vendorRuntime(tmp, repoRoot);
      expect(ok).toBe(existsSync(join(repoRoot, "node_modules/@huggingface/transformers/dist/transformers.web.js")));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});