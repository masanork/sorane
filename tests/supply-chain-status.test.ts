import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  buildSupplyChainStatus,
  renderStatusMarkdown,
} from "../scripts/supply-chain-status.ts";

describe("supply-chain-status", () => {
  test("buildSupplyChainStatus は v 付きリリース URL を出す", () => {
    const s = buildSupplyChainStatus("0.2.8");
    assert.equal(s.version, "0.2.8");
    assert.equal(s.release.tag, "v0.2.8");
    assert.ok(s.release.url.includes("/releases/tag/v0.2.8"));
    assert.equal(s.npm_packages.length, 5);
    assert.ok(s.cbom.algorithms.some((a) => a.name === "SHA-256"));
  });

  test("renderStatusMarkdown は表と JSON リンクを含む", () => {
    const md = renderStatusMarkdown(buildSupplyChainStatus("0.2.8"));
    assert.ok(md.includes("`0.2.8`"));
    assert.ok(md.includes("SHA-256"));
    assert.ok(md.includes("[supply-chain.json](/supply-chain.json)"));
  });
});