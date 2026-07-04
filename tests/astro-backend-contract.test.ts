import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  decodeBackendArtifact,
  runSoraneAstroTsBackend,
  writeSoraneAstroBackendArtifacts,
} from "../packages/astro/src/index.ts";

function fixtureFiles(): { root: string; contentDir: string; outDir: string } {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-contract-"));
  const contentDir = join(root, "src", "content");
  const posts = join(contentDir, "posts");
  mkdirSync(posts, { recursive: true });
  writeFileSync(
    join(posts, "hello.md"),
    `---
type: article
title: Contract Hello
description: backend contract
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.2
digitalSourceType: trainedAlgorithmicMedia
---

# Hello contract
`,
  );
  return { root, contentDir, outDir: join(root, "dist") };
}

describe("Sorane Astro backend contract", () => {
  test("runSoraneAstroTsBackend returns schema_version and artifacts", async () => {
    const paths = fixtureFiles();
    const files = collectSoraneAstroBackendFiles(paths.contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: {
          title: "Contract Site",
          description: "contract test",
          baseUrl: "https://example.dev",
        },
        collections: { posts: "blog" },
        validate: false,
      },
      paths,
      files,
    );

    expect(input.schema_version).toBe(SORANE_ASTRO_BACKEND_SCHEMA_VERSION);
    expect(input.files.length).toBe(1);

    const output = await runSoraneAstroTsBackend(input);
    expect(output.schema_version).toBe(SORANE_ASTRO_BACKEND_SCHEMA_VERSION);
    expect(output.concepts).toBe(1);
    expect(output.validationErrors).toBe(0);

    const pathsOut = output.artifacts.map((a) => a.path);
    expect(pathsOut).toContain("catalog.jsonld");
    expect(pathsOut).toContain("llms.txt");
    expect(pathsOut).toContain("okf/bundle.tar.gz");

    const catalog = output.artifacts.find((a) => a.path === "catalog.jsonld");
    expect(catalog?.kind).toBe("text");
    expect(String(catalog?.content)).toContain("Contract Hello");
    expect(String(catalog?.content)).toContain("https://example.dev/blog/hello.html");

    const bundle = output.artifacts.find((a) => a.path === "okf/bundle.tar.gz");
    expect(bundle?.kind).toBe("base64");
    const tar = gunzipSync(Buffer.from(String(bundle?.content), "base64"));
    expect(tar.toString("utf8")).toContain("article/posts-hello.md");
  });

  test("writeSoraneAstroBackendArtifacts decodes base64 bundle", async () => {
    const paths = fixtureFiles();
    const files = collectSoraneAstroBackendFiles(paths.contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "S", description: "D" },
        outputs: { catalog: false, llmsTxt: false, sitemap: false, okfBundle: true },
        validate: false,
      },
      paths,
      files,
    );
    const output = await runSoraneAstroTsBackend(input);
    const written = writeSoraneAstroBackendArtifacts(paths.outDir, output);
    expect(written).toContain("okf/bundle.tar.gz");
    const onDisk = readFileSync(join(paths.outDir, "okf", "bundle.tar.gz"));
    const decoded = decodeBackendArtifact(output.artifacts[0]!);
    expect(Buffer.compare(onDisk, decoded as Buffer)).toBe(0);
  });

  test("backend input can be serialized as JSON round-trip", async () => {
    const paths = fixtureFiles();
    const files = collectSoraneAstroBackendFiles(paths.contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "S", description: "D", baseUrl: "https://example.dev" },
        validate: false,
      },
      paths,
      files,
    );
    const json = JSON.stringify(input);
    const revived = JSON.parse(json) as typeof input;
    const output = await runSoraneAstroTsBackend(revived);
    expect(output.concepts).toBe(1);
    expect(output.artifacts.length > 0).toBe(true);
  });
});