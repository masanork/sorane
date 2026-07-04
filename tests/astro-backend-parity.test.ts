import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  runSoraneAstroCliBackend,
  runSoraneAstroTsBackend,
} from "../packages/astro/src/index.ts";

function parityFixture(): ReturnType<typeof buildSoraneAstroBackendInput> {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-parity-"));
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

describe("Astro backend parity", () => {
  test("Node CLI output matches inline TypeScript backend", async () => {
    const input = parityFixture();
    const ts = await runSoraneAstroTsBackend(input);
    const cli = runSoraneAstroCliBackend(input);

    expect(cli.concepts).toBe(ts.concepts);
    expect(cli.validationErrors).toBe(ts.validationErrors);
    expect(cli.validationWarnings).toBe(ts.validationWarnings);
    expect(cli.artifacts.length).toBe(ts.artifacts.length);

    for (const tsArtifact of ts.artifacts) {
      const cliArtifact = cli.artifacts.find((a) => a.path === tsArtifact.path);
      expect(cliArtifact !== undefined).toBe(true);
      expect(cliArtifact?.kind).toBe(tsArtifact.kind);
      expect(cliArtifact?.content).toBe(tsArtifact.content);
    }
  });
});