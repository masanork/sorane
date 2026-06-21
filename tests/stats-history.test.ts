import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, describe } from "node:test";
import {
  appendHistory,
  readHistory,
  renderTrendMarkdown,
  snapshotFromFullStats,
  type StatsSnapshot,
} from "../scripts/stats-history.ts";

const SAMPLE = {
  generatedAt: "2026-06-21T12:00:00.000Z",
  version: "0.2.7",
  git: { branch: "main", commit: "abc1234" },
  packages: {
    files: 10,
    lines: 1000,
    children: [{ name: "@sorane/core", lines: 800 }],
  },
  tests: { testFunctions: 50, lines: 400 },
  e2e: { lines: 20 },
  scripts: { lines: 100 },
  health: { totalLoc: 2000, dependencyCount: 100, todoCount: 0 },
  coverage: { totalPercent: 85.42 },
};

describe("stats-history", () => {
  test("snapshotFromFullStats はコンパクト行に変換する", () => {
    const snap = snapshotFromFullStats(SAMPLE);
    assert.equal(snap.commit, "abc1234");
    assert.equal(snap.packagesLines, 1000);
    assert.equal(snap.testFunctions, 50);
    assert.equal(snap.coveragePercent, 85.4);
    assert.equal(snap.workspaces["@sorane/core"], 800);
  });

  test("appendHistory は同一 commit を重複しない", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-stats-"));
    const path = join(dir, "history.jsonl");
    const snap: StatsSnapshot = {
      at: "2026-06-21T12:00:00.000Z",
      commit: "deadbeef",
      branch: "main",
      version: "0.2.7",
      packagesLines: 100,
      packagesFiles: 5,
      testFunctions: 10,
      testLines: 50,
      implLines: 120,
      totalLoc: 200,
      dependencies: 10,
      todoCount: 0,
      workspaces: {},
    };
    try {
      const first = await appendHistory(path, snap);
      assert.equal(first.appended, true);
      assert.equal(first.total, 1);
      const second = await appendHistory(path, snap);
      assert.equal(second.appended, false);
      assert.equal(second.total, 1);
      const rows = await readHistory(path);
      assert.equal(rows.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("renderTrendMarkdown は履歴テーブルを出す", () => {
    const md = renderTrendMarkdown([
      {
        at: "2026-06-20T12:00:00.000Z",
        commit: "1111111",
        branch: "main",
        version: "0.2.6",
        packagesLines: 8000,
        packagesFiles: 70,
        testFunctions: 240,
        testLines: 4000,
        implLines: 9000,
        totalLoc: 16000,
        dependencies: 500,
        todoCount: 0,
        workspaces: { "@sorane/core": 5000 },
      },
      {
        at: "2026-06-21T12:00:00.000Z",
        commit: "2222222",
        branch: "main",
        version: "0.2.7",
        packagesLines: 8914,
        packagesFiles: 79,
        testFunctions: 258,
        testLines: 4187,
        implLines: 9842,
        totalLoc: 17426,
        dependencies: 594,
        todoCount: 0,
        coveragePercent: 72.5,
        workspaces: { "@sorane/core": 5891 },
      },
    ]);
    assert.ok(md.includes("## Latest"));
    assert.ok(md.includes("Δ vs previous run"));
    assert.ok(md.includes("`2222222`"));
    assert.ok(md.includes("+914"));
  });
});