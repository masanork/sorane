import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { loadSoraneConfig } from "../packages/cli/src/config-load.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { runPdfExport } from "../packages/core/src/export/pdf.ts";
import { vivliostyleCliAvailable } from "../packages/core/src/export/vivliostyle-cli.ts";

const MINIMAL = join(import.meta.dirname, "../examples/minimal");

describe("runPdfExport", () => {
  test("minimal サイトの単一ページ export (--file)", async () => {
    if (!vivliostyleCliAvailable()) return;
    const dir = mkdtempSync(join(tmpdir(), "sorane-pdf-site-"));
    const dist = join(dir, "dist");
    const out = join(dir, "hello.pdf");
    const config = loadSoraneConfig(MINIMAL);
    try {
      await runBuild({
        cwd: MINIMAL,
        config: { ...config, build: { ...config.build, out_dir: dist } },
        clean: true,
      });
      const result = await runPdfExport({
        cwd: MINIMAL,
        config: { ...config, build: { ...config.build, out_dir: dist } },
        out,
        file: "article/2025-01-01-hello.md",
      });
      expect(result.files.length).toBe(1);
      expect(existsSync(out)).toBe(true);
      expect(statSync(out).size >= 1000).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("minimal サイトの単一ページ export (--html)", async () => {
    if (!vivliostyleCliAvailable()) return;
    const dir = mkdtempSync(join(tmpdir(), "sorane-pdf-html-"));
    const dist = join(dir, "dist");
    const out = join(dir, "hello.pdf");
    const config = loadSoraneConfig(MINIMAL);
    try {
      await runBuild({
        cwd: MINIMAL,
        config: { ...config, build: { ...config.build, out_dir: dist } },
        clean: true,
      });
      const result = await runPdfExport({
        cwd: MINIMAL,
        config: { ...config, build: { ...config.build, out_dir: dist } },
        out,
        html: "2025-01-01-hello.html",
      });
      expect(result.files.length).toBe(1);
      expect(existsSync(out)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});