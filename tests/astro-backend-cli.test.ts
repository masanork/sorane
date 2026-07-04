import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
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
});