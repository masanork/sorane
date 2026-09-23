import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";
import { normalizeConcept, packOkfc } from "../packages/okf/src/index.ts";

const CLI = new URL("../packages/cli/bin/sorane.mjs", import.meta.url).pathname;
const MINIMAL = join(import.meta.dirname, "../examples/minimal");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: join(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

describe("sorane index + search", () => {
  test("minimal example を index して FTS 検索", () => {
    const indexPath = join(MINIMAL, ".sorane/index.db");
    if (!existsSync(indexPath)) return;

    const index = runCli(["index", "--cwd", MINIMAL, "--force"]);
    expect(index.status).toBe(0);
    expect(index.stdout).toContain("indexed");

    const search = runCli([
      "search",
      "OKF",
      "--cwd",
      MINIMAL,
      "--prefer-index",
      "--json",
    ]);
    expect(search.status).toBe(0);
    const results = JSON.parse(search.stdout) as unknown[];
    expect(Array.isArray(results)).toBe(true);
  });

  test("search --type の後に query を解釈", () => {
    const indexPath = join(MINIMAL, ".sorane/index.db");
    if (!existsSync(indexPath)) return;

    const search = runCli([
      "search",
      "--type",
      "article",
      "Hello",
      "--cwd",
      MINIMAL,
      "--prefer-index",
      "--json",
    ]);
    expect(search.status).toBe(0);
    expect(search.stdout.length > 2).toBe(true);
  });
});

describe("sorane search via site.okfc (U4)", () => {
  test("--okfc で FTS 検索できる", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-search-okfc-"));
    try {
      const dbPath = join(dir, "site.okfc");
      const concept = normalizeConcept(
        { type: "article", title: "OKF Container Guide", tags: ["okf"] },
        "## Intro\n\n" + "OKFC full text search body content for agents. ".repeat(4),
        "guide",
      );
      await packOkfc({
        dbPath,
        concepts: [{ concept, slug: "guide" }],
        meta: { bundle_id: "test", title: "T", bundle_type: "site" },
      });

      const search = runCli([
        "search",
        "OKFC",
        "--okfc",
        dbPath,
        "--json",
        "--k",
        "5",
      ]);
      expect(search.status).toBe(0);
      const results = JSON.parse(search.stdout) as {
        backend: string;
        conceptId?: string;
        title: string;
      }[];
      expect(Array.isArray(results)).toBe(true);
      expect(results.length >= 1).toBe(true);
      expect(results[0]!.backend).toBe("okfc");
      expect(results[0]!.conceptId).toBe("article/guide");
      expect(search.stderr).toContain("okfc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("dist/okf/site.okfc を自動選択", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-search-auto-okfc-"));
    try {
      mkdirSync(join(dir, "content"), { recursive: true });
      mkdirSync(join(dir, "dist/okf"), { recursive: true });
      writeFileSync(
        join(dir, "sorane.yaml"),
        "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\n",
      );
      const concept = normalizeConcept(
        { type: "article", title: "Auto OKFC" },
        "## S\n\n" + "unique-token-xyzzy searchable in auto path. ".repeat(5),
        "auto",
      );
      await packOkfc({
        dbPath: join(dir, "dist/okf/site.okfc"),
        concepts: [{ concept, slug: "auto" }],
        meta: { bundle_id: "auto", title: "T", bundle_type: "site" },
      });

      const search = runCli([
        "search",
        "unique-token-xyzzy",
        "--cwd",
        dir,
        "--json",
      ]);
      expect(search.status).toBe(0);
      expect(search.stderr).toContain("okfc");
      const results = JSON.parse(search.stdout) as { backend: string }[];
      expect(results[0]?.backend).toBe("okfc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
