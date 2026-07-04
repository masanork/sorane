import { gunzipSync } from "node:zlib";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  runSoraneAstroTsBackend,
  soraneAstroNativeCliAvailable,
} from "../packages/astro/src/index.ts";

function parityFixture(): ReturnType<typeof buildSoraneAstroBackendInput> {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-native-parity-"));
  const contentDir = join(root, "src", "content");
  const posts = join(contentDir, "posts");
  mkdirSync(posts, { recursive: true });
  writeFileSync(
    join(posts, "hello.md"),
    `---
type: article
title: Parity Hello
description: parity test
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.2
digitalSourceType: trainedAlgorithmicMedia
---

# Hello
`,
  );
  const paths = { root, contentDir, outDir: join(root, "dist") };
  const files = collectSoraneAstroBackendFiles(contentDir);
  return buildSoraneAstroBackendInput(
    {
      site: { title: "Parity", description: "parity", baseUrl: "https://example.dev" },
      collections: { posts: "blog" },
      validate: false,
    },
    paths,
    files,
  );
}

function artifactContentEqual(
  path: string,
  tsContent: string,
  nativeContent: string,
): boolean {
  if (path === "okf/bundle.tar.gz") {
    const tsTar = gunzipSync(Buffer.from(tsContent, "base64"));
    const nativeTar = gunzipSync(Buffer.from(nativeContent, "base64"));
    return tsTar.equals(nativeTar);
  }
  return tsContent === nativeContent;
}

describe("Astro native backend parity", () => {
  test("native Rust output matches inline TypeScript backend", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = parityFixture();
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

      expect(native.concepts).toBe(ts.concepts);
      expect(native.validationErrors).toBe(ts.validationErrors);
      expect(native.validationWarnings).toBe(ts.validationWarnings);
      expect(native.artifacts.length).toBe(ts.artifacts.length);

      for (const tsArtifact of ts.artifacts) {
        const nativeArtifact = native.artifacts.find((a) => a.path === tsArtifact.path);
        expect(nativeArtifact !== undefined).toBe(true);
        expect(nativeArtifact?.kind).toBe(tsArtifact.kind);
        expect(
          artifactContentEqual(
            tsArtifact.path,
            tsArtifact.content,
            nativeArtifact?.content ?? "",
          ),
        ).toBe(true);
      }
  });
});