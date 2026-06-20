import { describe, expect, test } from "./_expect.ts";
import { processStaticAssets } from "../packages/core/src/static-assets.ts";
import {
  c2patoolAvailable,
  probeC2paManifest,
} from "../packages/core/src/c2pa-pass.ts";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { C2PA_TEST_CERT, C2PA_TEST_KEY } from "./_c2pa-fixture.ts";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("processStaticAssets", () => {
  test("static を dist にコピーする", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-static-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "pixel.png"), TINY_PNG);
    writeFileSync(join(staticSrc, "readme.txt"), "ok", "utf8");

    try {
      const result = await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        c2pa: { enabled: false },
      });
      expect(result.rasterCopied).toBe(1);
      expect(existsSync(join(outDir, "static/pixel.png"))).toBe(true);
      expect(readFileSync(join(outDir, "static/readme.txt"), "utf8")).toBe("ok");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("c2pa enabled で raster に署名する（c2patool がある場合）", async () => {
    if (!c2patoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-static-c2pa-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "pixel.png"), TINY_PNG);
    writeFileSync(
      join(contentDir, "asset-provenance.yaml"),
      "assets:\n  pixel.png:\n    digitalSourceType: trainedAlgorithmicMedia\n",
      "utf8",
    );
    try {
      const result = await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        c2pa: {
          enabled: true,
          certificate_path: C2PA_TEST_CERT,
          private_key_path: C2PA_TEST_KEY,
        },
      });
      expect(result.rasterCopied).toBe(1);
      expect(result.rasterSigned).toBe(1);
      const outPath = join(outDir, "static/pixel.png");
      expect(existsSync(outPath)).toBe(true);
      expect(probeC2paManifest(outPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});