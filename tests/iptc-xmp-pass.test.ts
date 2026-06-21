import { describe, expect, test } from "./_expect.ts";
import {
  buildIptcXmpExiftoolArgs,
  embedIptcXmp,
  exiftoolAvailable,
  hasImageMetadataFields,
  isImageMetadataPath,
  probeIptcXmp,
} from "../packages/core/src/iptc-xmp-pass.ts";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("isImageMetadataPath", () => {
  test("jpg/png/webp のみ", () => {
    expect(isImageMetadataPath("a.jpg")).toBe(true);
    expect(isImageMetadataPath("a.webp")).toBe(true);
    expect(isImageMetadataPath("a.gif")).toBe(false);
  });
});

describe("hasImageMetadataFields", () => {
  test("開示フィールドがあれば true", () => {
    expect(hasImageMetadataFields({ digitalSourceType: "trainedAlgorithmicMedia" })).toBe(
      true,
    );
    expect(hasImageMetadataFields(undefined)).toBe(false);
  });
});

describe("buildIptcXmpExiftoolArgs", () => {
  test("DigitalSourceType と AI 系タグを組み立てる", () => {
    const args = buildIptcXmpExiftoolArgs({
      digitalSourceType: "trainedAlgorithmicMedia",
      aiDisclosureNote: "prompt used",
      aiSystems: [{ name: "Claude", version: "3.5", provider: "Anthropic" }],
    });
    expect(args.includes("-overwrite_original")).toBe(true);
    expect(
      args.some((a) =>
        a.includes("http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"),
      ),
    ).toBe(true);
    expect(args.some((a) => a.includes("AIPromptInformation=prompt used"))).toBe(true);
    expect(args.some((a) => a.includes("AISystemUsed=Claude (Anthropic)"))).toBe(true);
  });
});

describe("exiftool integration", () => {
  test("embed + probe when exiftool available", () => {
    if (!exiftoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-iptc-"));
    try {
      const path = join(root, "pixel.png");
      writeFileSync(path, TINY_PNG);
      const uri = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
      const embedded = embedIptcXmp(path, {
        digitalSourceType: "trainedAlgorithmicMedia",
        aiDisclosureNote: "E2E IPTC note",
        aiSystems: [{ name: "TestModel", version: "1" }],
      });
      expect(embedded.ok).toBe(true);
      expect(probeIptcXmp(path, uri)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});