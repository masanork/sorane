import { describe, expect, test } from "./_expect.ts";
import {
  loadAssetProvenance,
  lookupAssetProvenance,
  resolveC2paCreateIntent,
} from "../packages/core/src/asset-provenance.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("lookupAssetProvenance", () => {
  test("markdown パスエイリアスで解決", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-prov-lookup-"));
    try {
      writeFileSync(
        join(root, "asset-provenance.yaml"),
        "assets:\n  ../static/hero.png:\n    digitalSourceType: trainedAlgorithmicMedia\n",
        "utf8",
      );
      const map = loadAssetProvenance(root);
      const hit = lookupAssetProvenance(map, {
        markdownPath: "../static/hero.png",
        staticRel: "hero.png",
        sourceMdRel: "article/post.md",
      });
      expect(hit?.digitalSourceType).toBe("trainedAlgorithmicMedia");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("resolveC2paCreateIntent", () => {
  test("digitalSourceType から create intent を解決", () => {
    expect(
      resolveC2paCreateIntent({ digitalSourceType: "trainedAlgorithmicMedia" }),
    ).toBe("trainedAlgorithmicMedia");
  });

  test("未指定は digitalCapture", () => {
    expect(resolveC2paCreateIntent(undefined)).toBe("digitalCapture");
  });
});

describe("loadAssetProvenance", () => {
  test("asset-provenance.yaml を読む", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-prov-"));
    try {
      writeFileSync(
        join(root, "asset-provenance.yaml"),
        "assets:\n  hero.png:\n    digitalSourceType: trainedAlgorithmicMedia\n    aiSystems:\n      - name: DALL-E\n",
        "utf8",
      );
      const map = loadAssetProvenance(root);
      expect(map["hero.png"]?.digitalSourceType).toBe("trainedAlgorithmicMedia");
      expect(map["hero.png"]?.aiSystems?.[0]?.name).toBe("DALL-E");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});