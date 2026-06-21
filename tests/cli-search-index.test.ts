import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";

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

    const index = runCli(["index", "--cwd", MINIMAL, "--fts-only", "--force"]);
    expect(index.status).toBe(0);
    expect(index.stdout).toContain("indexed");

    const search = runCli(["search", "OKF", "--cwd", MINIMAL, "--fts-only", "--json"]);
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
      "--fts-only",
      "--json",
    ]);
    expect(search.status).toBe(0);
    expect(search.stdout.length > 2).toBe(true);
  });
});