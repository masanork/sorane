import { describe, expect, test } from "./_expect.ts";
import { processStaticAssets } from "../packages/core/src/static-assets.ts";
import {
  c2patoolAvailable,
  probeC2paManifest,
} from "../packages/core/src/c2pa-pass.ts";
import { exiftoolAvailable, probeIptcXmp } from "../packages/core/src/iptc-xmp-pass.ts";
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
      expect(result.metadataEmbedded).toBe(0);
      expect(result.inlineImagesCopied).toBe(0);
      expect(existsSync(join(outDir, "static/pixel.png"))).toBe(true);
      expect(readFileSync(join(outDir, "static/readme.txt"), "utf8")).toBe("ok");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("image_metadata enabled で XMP を埋め込む（exiftool がある場合）", async () => {
    if (!exiftoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-static-xmp-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "hero.png"), TINY_PNG);
    writeFileSync(
      join(contentDir, "asset-provenance.yaml"),
      [
        "assets:",
        "  hero.png:",
        "    digitalSourceType: trainedAlgorithmicMedia",
        "    aiDisclosureNote: Generated for test",
        "    aiSystems:",
        "      - name: TestGen",
        "        version: \"1\"",
      ].join("\n"),
      "utf8",
    );

    try {
      const result = await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        imageMetadata: { enabled: true },
        c2pa: { enabled: false },
      });
      expect(result.metadataEmbedded).toBe(1);
      const outPath = join(outDir, "static/hero.png");
      expect(
        probeIptcXmp(
          outPath,
          "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("content 内インライン画像を dist にコピーして XMP 埋め込み", async () => {
    if (!exiftoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-static-inline-"));
    const staticSrc = join(root, "static");
    const contentDir = join(root, "content");
    const assetsDir = join(contentDir, "article", "assets");
    const outDir = join(root, "dist");
    mkdirSync(assetsDir, { recursive: true });
    mkdirSync(staticSrc, { recursive: true });
    writeFileSync(join(assetsDir, "inline.png"), TINY_PNG);
    writeFileSync(
      join(contentDir, "asset-provenance.yaml"),
      "assets:\n  article/assets/inline.png:\n    digitalSourceType: trainedAlgorithmicMedia\n",
      "utf8",
    );

    try {
      const result = await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        imageMetadata: { enabled: true },
        c2pa: { enabled: false },
        inlineImages: [
          {
            markdownPath: "assets/inline.png",
            sourceMdRel: "article/post.md",
            srcAbs: join(assetsDir, "inline.png"),
            kind: "content",
            publicPath: "article/assets/inline.png",
            outRel: "article/assets/inline.png",
            alt: "",
          },
        ],
      });
      expect(result.inlineImagesCopied).toBe(1);
      expect(result.metadataEmbedded).toBe(1);
      expect(existsSync(join(outDir, "article/assets/inline.png"))).toBe(true);
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