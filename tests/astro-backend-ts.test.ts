import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  emitAstroSearchAssets,
  resolveSoraneAstroBackend,
  runSoraneAstroBackend,
  runSoraneAstroTsBackend,
  type SoraneAstroBackendInput,
} from "../packages/astro/src/index.ts";
import { collectBackendValidation } from "../packages/astro/src/validation.ts";

function contentFixture(): {
  root: string;
  contentDir: string;
  outDir: string;
  files: ReturnType<typeof collectSoraneAstroBackendFiles>;
} {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-ts-"));
  const contentDir = join(root, "src", "content");
  const posts = join(contentDir, "posts");
  mkdirSync(posts, { recursive: true });
  writeFileSync(
    join(posts, "hello.md"),
    `---
type: article
title: TS Backend Hello
description: ts backend coverage
timestamp: 2026-07-04T00:00:00Z
---

# Hello
`,
  );
  return {
    root,
    contentDir,
    outDir: join(root, "dist"),
    files: collectSoraneAstroBackendFiles(contentDir),
  };
}

describe("collectBackendValidation", () => {
  test("validate: false skips site validation", () => {
    const { root, contentDir, outDir, files } = contentFixture();
    const input = buildSoraneAstroBackendInput(
      { site: { title: "S", description: "D" }, validate: false },
      { root, contentDir, outDir },
      files,
    );
    const result = collectBackendValidation(input, false);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.details.length).toBe(0);
  });

  test("quality.heading error surfaces validation errors from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-ts-heading-"));
    const contentDir = join(root, "src", "content", "posts");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "bad.md"),
      `---
type: article
title: Bad Heading
timestamp: 2026-07-04T00:00:00Z
---

### skipped level
`,
    );
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "S", description: "D" },
        validate: "warn",
        quality: { heading: "error" },
      },
      { root, contentDir: join(root, "src", "content"), outDir: join(root, "dist") },
      collectSoraneAstroBackendFiles(join(root, "src", "content")),
    );
    const result = collectBackendValidation(input, "warn");
    expect(result.errors > 0).toBe(true);
    expect(result.details.some((d) => d.includes("heading:"))).toBe(true);
  });

  test("relative contentDir is passed through to validateSiteContent", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-ts-reldir-"));
    const contentDir = join(root, "src", "content");
    mkdirSync(join(contentDir, "posts"), { recursive: true });
    writeFileSync(
      join(contentDir, "posts", "ok.md"),
      `---
type: article
title: OK
timestamp: 2026-07-04T00:00:00Z
---
body
`,
    );
    const input: SoraneAstroBackendInput = {
      schema_version: 1,
      root,
      contentDir: "src/content",
      outDir: join(root, "dist"),
      site: { title: "S", description: "D" },
      files: collectSoraneAstroBackendFiles(contentDir),
      validate: "warn",
    };
    const result = collectBackendValidation(input, "warn");
    expect(result.errors).toBe(0);
  });
});

describe("runSoraneAstroTsBackend outputs", () => {
  test("emits catalog-dcat.jsonld and sitemap.xml when enabled", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-ts-dcat-"));
    const data = join(root, "src", "content", "data");
    mkdirSync(data, { recursive: true });
    writeFileSync(
      join(data, "stats.md"),
      `---
type: dataset
title: Open Stats
description: sample dataset
timestamp: 2026-07-04T00:00:00Z
identifier: stats-001
---
body
`,
    );
    const contentDir = join(root, "src", "content");
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "S", description: "D", baseUrl: "https://example.dev" },
        openData: { dcatCatalog: true, defaultLicense: "CC-BY-4.0" },
        outputs: {
          catalog: true,
          llmsTxt: true,
          okfBundle: false,
          sitemap: true,
        },
        validate: false,
      },
      { root, contentDir, outDir: join(root, "dist") },
      collectSoraneAstroBackendFiles(contentDir),
    );

    const output = await runSoraneAstroTsBackend(input);
    const paths = output.artifacts.map((a) => a.path);
    expect(paths).toContain("catalog-dcat.jsonld");
    expect(paths).toContain("sitemap.xml");

    const dcat = output.artifacts.find((a) => a.path === "catalog-dcat.jsonld");
    expect(String(dcat?.content)).toContain("dcat:Dataset");
    expect(String(dcat?.content)).toContain("Open Stats");

    const llms = output.artifacts.find((a) => a.path === "llms.txt");
    expect(String(llms?.content)).toContain("catalog-dcat.jsonld");

    const sitemap = output.artifacts.find((a) => a.path === "sitemap.xml");
    expect(String(sitemap?.content)).toContain("https://example.dev/data/stats.html");
  });
});

describe("resolveSoraneAstroBackend", () => {
  test("backend ts runs inline TypeScript backend", async () => {
    const { root, contentDir, outDir, files } = contentFixture();
    const input = buildSoraneAstroBackendInput(
      { site: { title: "S", description: "D" }, backend: "ts", validate: false },
      { root, contentDir, outDir },
      files,
    );
    expect(resolveSoraneAstroBackend("ts")).toBe("ts");
    const output = await runSoraneAstroBackend("ts", input);
    expect(output.concepts).toBe(1);
    expect(output.validationErrors).toBe(0);
  });

  test("wasm resolves to ts with warning", () => {
    const warnings: string[] = [];
    expect(resolveSoraneAstroBackend("wasm", { warn: (m) => warnings.push(m) })).toBe("ts");
    expect(warnings.some((w) => w.includes('backend "wasm"'))).toBe(true);
  });

  test("runSoraneAstroWasmBackend throws until artifact ships", async () => {
    const { root, contentDir, outDir, files } = contentFixture();
    const input = buildSoraneAstroBackendInput(
      { site: { title: "S", description: "D" }, validate: false },
      { root, contentDir, outDir },
      files,
    );
    let threw = false;
    try {
      await runSoraneAstroBackend("wasm", input);
    } catch (e) {
      threw = e instanceof Error && e.message.includes("WASM backend is not published");
    }
    expect(threw).toBe(true);
  });
});

describe("emitAstroSearchAssets hybrid fallback", () => {
  test("missing model directory indexes FTS-only", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-ts-search-"));
    const contentDir = join(root, "src", "content");
    const posts = join(contentDir, "posts");
    mkdirSync(posts, { recursive: true });
    writeFileSync(
      join(posts, "findme.md"),
      `---
type: article
title: Find Me
description: hybrid fallback test with enough body text for chunking
timestamp: 2026-07-04T00:00:00Z
---

# Find Me

This article has enough body text to produce at least one search chunk when
indexed in FTS-only fallback mode without a hybrid embedding model directory.
`,
    );
    const warnings: string[] = [];
    const files = await emitAstroSearchAssets({
      root,
      contentDir,
      outDir: join(root, "dist"),
      sourceToUrl: () => "posts/findme.html",
      search: { mode: "hybrid", force: true, modelRoot: "vendor/missing-models" },
      logger: { warn: (m) => warnings.push(m) },
    });
    expect(files).toContain("assets/search-index.json");
    expect(warnings.some((w) => w.includes("hybrid search model not found"))).toBe(true);
  });
});