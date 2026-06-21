import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";
import { parseWatchArgv, watchPaths } from "../packages/cli/src/watch.ts";

const CLI = new URL("../packages/cli/bin/sorane.mjs", import.meta.url).pathname;

describe("parseWatchArgv", () => {
  test("--cwd と --clean を解釈", () => {
    const parsed = parseWatchArgv(["--cwd", "/tmp/site", "--clean"]);
    expect(parsed.cwd.endsWith("/tmp/site") || parsed.cwd === "/tmp/site").toBe(true);
    expect(parsed.clean).toBe(true);
    expect(parsed.buildArgv).toContain("--clean");
  });
});

describe("watchPaths", () => {
  test("content / sorane.yaml / static を含む", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-watch-"));
    mkdirSync(join(root, "content"), { recursive: true });
    mkdirSync(join(root, "static"), { recursive: true });
    writeFileSync(join(root, "sorane.yaml"), "site:\n  title: T\n", "utf8");
    try {
      const paths = watchPaths(root, "content");
      expect(paths.length).toBe(3);
      expect(paths.some((p) => p.endsWith("sorane.yaml"))).toBe(true);
      expect(paths.some((p) => p.endsWith("static"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("search no results", () => {
  test("該当無しは (no results)", () => {
    const minimal = join(import.meta.dirname, "../examples/minimal");
    const r = spawnSync(
      process.execPath,
      [CLI, "search", "zzz-nonexistent-query-xyz", "--cwd", minimal, "--fts-only"],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("(no results)");
  });
});

describe("validate human report", () => {
  test("警告付き valid サイト", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-validate-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "warn.md"),
      "---\ntype: article\ntitle: T\nprofile: sorane-okf/0.1\n---\n\n# T\n\nBody.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\n",
      "utf8",
    );
    try {
      const r = spawnSync(process.execPath, [CLI, "validate", "--cwd", root], {
        encoding: "utf8",
      });
      expect(r.status).toBe(0);
      expect(r.stdout + r.stderr).toMatch(/valid|warning/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});