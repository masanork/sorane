import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroArtifacts,
  emitSoraneAstroArtifacts,
  resolveSoraneAstroBackend,
  runSoraneAstroTsBackend,
  soraneAstroNativeCliEnabled,
} from "../packages/astro/src/index.ts";
import { soraneAstroNativeCliAvailable } from "../packages/astro/src/backend-cli.ts";

/**
 * Guards the TypeScript artifact backend when native CLI is unavailable.
 * CI job `astro-ts-fallback` runs this file without `cargo build`.
 */
describe("Astro TypeScript fallback (CI guard)", () => {
  test("backend auto resolves to ts when native CLI is not built", () => {
    if (soraneAstroNativeCliAvailable()) {
      // Local dev machines with cargo build use native; skip resolution check.
      return;
    }
    expect(resolveSoraneAstroBackend("auto")).toBe("ts");
  });

  test("backend auto skips native when SORANE_ASTRO_BACKEND_NATIVE=0", () => {
    if (!soraneAstroNativeCliAvailable()) return;

    const prev = process.env.SORANE_ASTRO_BACKEND_NATIVE;
    process.env.SORANE_ASTRO_BACKEND_NATIVE = "0";
    try {
      expect(soraneAstroNativeCliEnabled()).toBe(false);
      expect(resolveSoraneAstroBackend("auto")).not.toBe("cli");
    } finally {
      if (prev === undefined) delete process.env.SORANE_ASTRO_BACKEND_NATIVE;
      else process.env.SORANE_ASTRO_BACKEND_NATIVE = prev;
    }
  });

  test("emitSoraneAstroArtifacts succeeds via backend ts when native CLI is absent", async () => {
    if (soraneAstroNativeCliAvailable()) return;

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-ts-fallback-"));
    const posts = join(root, "src", "content", "posts");
    mkdirSync(posts, { recursive: true });
    writeFileSync(
      join(posts, "hello.md"),
      `---
type: article
title: TS Fallback
description: no native cli
timestamp: 2026-07-04T00:00:00Z
---

# Hello

Enough body text for OKF artifact emission when the TypeScript backend is the only option.
`,
    );

    const warnings: string[] = [];
    const result = await emitSoraneAstroArtifacts({
      root,
      site: { title: "TS Fallback", description: "guard", baseUrl: "https://example.dev" },
      backend: "ts",
      validate: false,
      logger: { warn: (m) => warnings.push(m) },
    });

    expect(result.concepts).toBe(1);
    expect(existsSync(join(root, "dist", "catalog.jsonld"))).toBe(true);
    const catalog = readFileSync(join(root, "dist", "catalog.jsonld"), "utf8");
    expect(catalog).toContain("TS Fallback");
    expect(warnings.some((w) => w.includes("not available yet"))).toBe(false);
  });

  test("buildSoraneAstroArtifacts builds OKF artifacts without validation", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-artifacts-"));
    const contentDir = join(root, "src", "content", "posts");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "hello.md"),
      `---
type: article
title: Artifacts Only
timestamp: 2026-07-04T00:00:00Z
---

# Artifacts Only
`,
    );
    const { buildSoraneAstroBackendInput, collectSoraneAstroBackendFiles } = await import(
      "../packages/astro/src/index.ts"
    );
    const files = collectSoraneAstroBackendFiles(join(root, "src", "content"));
    const input = buildSoraneAstroBackendInput(
      { site: { title: "S", description: "D" }, backend: "ts", validate: false },
      { root, contentDir: join(root, "src", "content"), outDir: join(root, "dist") },
      files,
    );
    const built = await buildSoraneAstroArtifacts(input);
    expect(built.concepts).toBe(1);
    expect(built.artifacts.some((a) => a.path === "catalog.jsonld")).toBe(true);
  });

  test("runSoraneAstroTsBackend remains the reference inline implementation", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-ts-ref-"));
    const contentDir = join(root, "src", "content", "posts");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "hello.md"),
      `---
type: article
title: TS Reference
timestamp: 2026-07-04T00:00:00Z
---

# TS Reference
`,
    );
    const { buildSoraneAstroBackendInput, collectSoraneAstroBackendFiles } = await import(
      "../packages/astro/src/index.ts"
    );
    const files = collectSoraneAstroBackendFiles(join(root, "src", "content"));
    const input = buildSoraneAstroBackendInput(
      { site: { title: "S", description: "D" }, backend: "ts", validate: false },
      { root, contentDir: join(root, "src", "content"), outDir: join(root, "dist") },
      files,
    );
    const output = await runSoraneAstroTsBackend(input);
    expect(output.concepts).toBe(1);
    expect(output.artifacts.some((a) => a.path === "catalog.jsonld")).toBe(true);
  });
});