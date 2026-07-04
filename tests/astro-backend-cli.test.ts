import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  resolveAstroBackendBinBackend,
  runSoraneAstroBackendBin,
  runSoraneAstroCliBackend,
  soraneAstroCliAvailable,
} from "../packages/astro/src/index.ts";

describe("sorane-astro-backend CLI", () => {
  test("emits contract output when binary is built", (t) => {
    if (!soraneAstroCliAvailable()) return t.skip("sorane-astro-backend CLI not built");

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-cli-"));
    const contentDir = join(root, "src", "content");
    const posts = join(contentDir, "posts");
    mkdirSync(posts, { recursive: true });
    writeFileSync(
      join(posts, "hello.md"),
      `---
type: article
title: CLI Hello
description: cli backend
timestamp: 2026-07-04T00:00:00Z
---

# Hello CLI
`,
    );

    const paths = { root, contentDir, outDir: join(root, "dist") };
    const files = collectSoraneAstroBackendFiles(contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "CLI", description: "cli", baseUrl: "https://example.dev" },
        collections: { posts: "blog" },
        validate: false,
      },
      paths,
      files,
    );

    const output = runSoraneAstroCliBackend(input);
    expect(output.concepts).toBe(1);
    const catalog = output.artifacts.find((a) => a.path === "catalog.jsonld");
    expect(String(catalog?.content)).toContain("CLI Hello");
    expect(String(catalog?.content)).toContain("https://example.dev/blog/hello.html");

    const bundle = output.artifacts.find((a) => a.path === "okf/bundle.tar.gz");
    const tar = gunzipSync(Buffer.from(String(bundle?.content), "base64"));
    expect(tar.toString("utf8")).toContain("article/posts-hello.md");
  });

  test("npm bin entry prefers native when binary is built", async (t) => {
    if (!soraneAstroCliAvailable()) return t.skip("sorane-astro-backend CLI not built");

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-bin-"));
    const contentDir = join(root, "src", "content");
    mkdirSync(join(contentDir, "posts"), { recursive: true });
    writeFileSync(
      join(contentDir, "posts", "bin.md"),
      "---\ntype: article\ntitle: Bin\n---\n\nBin entry routes to native when the Rust CLI is built.\n",
    );
    const paths = { root, contentDir, outDir: join(root, "dist") };
    const input = buildSoraneAstroBackendInput(
      { site: { title: "Bin", description: "d" }, validate: false },
      paths,
      collectSoraneAstroBackendFiles(contentDir),
    );

    expect(resolveAstroBackendBinBackend(root)).toBe("cli");
    const output = await runSoraneAstroBackendBin(input);
    expect(output.concepts).toBe(1);
    expect(output.artifacts.some((a) => a.path === "catalog.jsonld")).toBe(true);
  });

  test("npm bin entry uses TypeScript when SORANE_ASTRO_BACKEND_NATIVE=0", async () => {
    if (!soraneAstroCliAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-bin-ts-"));
    const contentDir = join(root, "src", "content");
    mkdirSync(join(contentDir, "posts"), { recursive: true });
    writeFileSync(
      join(contentDir, "posts", "ts.md"),
      "---\ntype: article\ntitle: TS Bin\n---\n\nTypeScript fallback for npm bin when native is opted out.\n",
    );
    const paths = { root, contentDir, outDir: join(root, "dist") };
    const input = buildSoraneAstroBackendInput(
      { site: { title: "TS Bin", description: "d" }, validate: false },
      paths,
      collectSoraneAstroBackendFiles(contentDir),
    );

    const prev = process.env.SORANE_ASTRO_BACKEND_NATIVE;
    process.env.SORANE_ASTRO_BACKEND_NATIVE = "0";
    try {
      expect(resolveAstroBackendBinBackend(root)).toBe("ts");
      const output = await runSoraneAstroBackendBin(input);
      expect(output.concepts).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.SORANE_ASTRO_BACKEND_NATIVE;
      else process.env.SORANE_ASTRO_BACKEND_NATIVE = prev;
    }
  });
});