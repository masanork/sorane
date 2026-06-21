import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test, describe } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts/project-stats.ts");

describe("project-stats", () => {
  test("--json でスキーマ付きレポートを返す", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout) as {
      version: string;
      packages: { lines: number; children?: { name: string }[] };
      tests: { testFunctions: number };
      health: { totalLoc: number };
    };
    assert.ok(parsed.version.length > 0);
    assert.ok(parsed.packages.lines > 0);
    assert.ok((parsed.packages.children?.length ?? 0) >= 4);
    assert.ok(parsed.tests.testFunctions > 0);
    assert.ok(parsed.health.totalLoc > parsed.packages.lines);
  });
});