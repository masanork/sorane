import { describe, expect, test } from "./_expect.ts";
import {
  c2patoolAvailable,
  isC2paRasterPath,
  probeC2paManifest,
  resolveC2paCredentials,
  signRasterWithC2pa,
} from "../packages/core/src/c2pa-pass.ts";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { C2PA_TEST_CERT, C2PA_TEST_KEY } from "./_c2pa-fixture.ts";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("isC2paRasterPath", () => {
  test("jpg/png のみ", () => {
    expect(isC2paRasterPath("a.jpg")).toBe(true);
    expect(isC2paRasterPath("a.PNG")).toBe(true);
    expect(isC2paRasterPath("a.webp")).toBe(false);
  });
});

describe("resolveC2paCredentials", () => {
  test("enabled だが cred 無しは null", () => {
    const prevCert = process.env.SORANE_C2PA_CERT;
    const prevKey = process.env.SORANE_C2PA_KEY;
    delete process.env.SORANE_C2PA_CERT;
    delete process.env.SORANE_C2PA_KEY;
    try {
      expect(resolveC2paCredentials({ enabled: true })).toBe(null);
    } finally {
      if (prevCert) process.env.SORANE_C2PA_CERT = prevCert;
      if (prevKey) process.env.SORANE_C2PA_KEY = prevKey;
    }
  });
});

describe("c2patool integration", () => {
  test("sign + probe when c2patool available", () => {
    if (!c2patoolAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-c2pa-int-"));
    try {
      const input = join(root, "in.png");
      const output = join(root, "out.png");
      writeFileSync(input, TINY_PNG);
      const signed = signRasterWithC2pa(input, output, {
        createIntent: "trainedAlgorithmicMedia",
        credentials: { signCert: C2PA_TEST_CERT, privateKey: C2PA_TEST_KEY },
      });
      expect(signed.ok).toBe(true);
      expect(existsSync(output)).toBe(true);
      expect(probeC2paManifest(output)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});