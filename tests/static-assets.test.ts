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

  test("c2pa enabled だが c2patool 無しは警告", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-static-c2pa-tool-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "pixel.png"), TINY_PNG);
    const warnings: string[] = [];
    try {
      await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        c2pa: {
          enabled: true,
          binary: "__sorane_no_c2patool__",
          certificate_path: C2PA_TEST_CERT,
          private_key_path: C2PA_TEST_KEY,
        },
        onWarning: (m) => warnings.push(m),
      });
      expect(warnings.some((w) => w.includes("not found on PATH"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("c2pa enabled だが credentials 無しは警告してコピーのみ", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-static-c2pa-warn-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "pixel.png"), TINY_PNG);
    const warnings: string[] = [];
    try {
      const result = await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        c2pa: { enabled: true },
        onWarning: (m) => warnings.push(m),
      });
      expect(result.rasterCopied).toBe(1);
      expect(result.rasterSigned).toBe(0);
      expect(warnings.some((w) => w.includes("credentials missing"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("image_metadata enabled だが exiftool 無しは警告", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-static-xmp-warn-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "hero.png"), TINY_PNG);
    const warnings: string[] = [];
    try {
      await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        imageMetadata: { enabled: true, exiftool: "__sorane_no_exiftool__" },
        onWarning: (m) => warnings.push(m),
      });
      expect(warnings.some((w) => w.includes("not found on PATH"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("static 無しでもインライン画像だけ処理する", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-static-inline-only-"));
    const contentDir = join(root, "content");
    const assetsDir = join(contentDir, "assets");
    const outDir = join(root, "dist");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "only.png"), TINY_PNG);
    try {
      const result = await processStaticAssets({
        cwd: root,
        staticSrc: join(root, "missing-static"),
        outDir,
        staticDirName: "static",
        contentDir,
        inlineImages: [
          {
            markdownPath: "assets/only.png",
            sourceMdRel: "post.md",
            srcAbs: join(assetsDir, "only.png"),
            kind: "content",
            publicPath: "assets/only.png",
            outRel: "assets/only.png",
            alt: "",
          },
        ],
      });
      expect(result.inlineImagesCopied).toBe(1);
      expect(existsSync(join(outDir, "assets/only.png"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("XMP 埋め込み失敗は警告", async () => {
    if (!exiftoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-static-xmp-fail-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "bad.png"), "not-a-png", "utf8");
    writeFileSync(
      join(contentDir, "asset-provenance.yaml"),
      "assets:\n  bad.png:\n    digitalSourceType: trainedAlgorithmicMedia\n",
      "utf8",
    );
    const warnings: string[] = [];
    try {
      await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        imageMetadata: { enabled: true },
        c2pa: { enabled: false },
        onWarning: (m) => warnings.push(m),
      });
      expect(warnings.some((w) => w.includes("iptc-xmp: failed"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("c2pa 署名失敗は警告", async () => {
    if (!c2patoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-static-c2pa-fail-"));
    const staticSrc = join(root, "static");
    const outDir = join(root, "dist");
    const contentDir = join(root, "content");
    mkdirSync(staticSrc, { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(staticSrc, "bad.png"), "not-a-png", "utf8");
    const warnings: string[] = [];
    try {
      await processStaticAssets({
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
        onWarning: (m) => warnings.push(m),
      });
      expect(warnings.some((w) => w.includes("c2pa: failed"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("onProgress に iptc-xmp / c2pa ログを出す", async () => {
    if (!exiftoolAvailable() || !c2patoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-static-progress-"));
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
    const progress: string[] = [];
    try {
      await processStaticAssets({
        cwd: root,
        staticSrc,
        outDir,
        staticDirName: "static",
        contentDir,
        imageMetadata: { enabled: true },
        c2pa: {
          enabled: true,
          certificate_path: C2PA_TEST_CERT,
          private_key_path: C2PA_TEST_KEY,
        },
        onProgress: (m) => progress.push(m),
      });
      expect(progress.some((m) => m.includes("iptc-xmp:"))).toBe(true);
      expect(progress.some((m) => m.includes("c2pa:"))).toBe(true);
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