import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("cbom-check passes against cbom.json", () => {
  const result = spawnSync("node", ["scripts/cbom-check.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `cbom-check failed:\n${result.stdout}\n${result.stderr}`,
  );
  assert.match(result.stdout, /cbom-check: ok/);
});