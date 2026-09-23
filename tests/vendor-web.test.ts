import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  copySearchScript,
  readSearchScript,
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

});
describe("offline search SW", () => {
  test("writeSearchServiceWorker が precache を埋め込む", async () => {
    const { writeSearchServiceWorker, buildSearchServiceWorkerSource } = await import(
      "../packages/search/src/offline-sw.ts"
    );
    const tmp = mkdtempSync(join(tmpdir(), "sorane-sw-"));
    try {
      writeSearchServiceWorker(tmp, {
        precache: ["assets/search.mjs", "assets/search-index.json", "search.html"],
        version: "test",
      });
      const body = readFileSync(join(tmp, "sw.js"), "utf8");
      expect(body.includes("assets/search.mjs")).toBe(true);
      expect(body.includes("search-index.json")).toBe(true);
      expect(body.includes("search.html")).toBe(true);
      expect(body.includes("sorane-offline-search-test")).toBe(true);
      const src = buildSearchServiceWorkerSource({
        precache: ["assets/search.mjs"],
        version: "v",
      });
      expect(src.includes("install")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
