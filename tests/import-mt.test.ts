import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { parseMtExport } from "../packages/core/src/import/adapters/mt.ts";
import { detectImportFormat } from "../packages/core/src/import/detect-format.ts";
import { runImport } from "../packages/core/src/import/run-import.ts";

const SAMPLE_MT = join(import.meta.dirname, "fixtures/import/sample-mt.txt");
const MINIMAL = join(import.meta.dirname, "../examples/minimal");

describe("parseMtExport", () => {
  test("sample fixture → 2 published entries", () => {
    const text = readFileSync(SAMPLE_MT, "utf8");
    const entries = parseMtExport(text);
    expect(entries.length).toBe(2);
    expect(entries[0]!.title).toBe("Hello Import");
    expect(entries[0]!.body).toContain("MT");
    expect(entries[1]!.body).toContain("Extended section");
  });

  test("include drafts", () => {
    const text = readFileSync(SAMPLE_MT, "utf8");
    const entries = parseMtExport(text, { skipDrafts: false });
    expect(entries.length).toBe(3);
  });
});

describe("detectImportFormat", () => {
  test("sample MT file", () => {
    const text = readFileSync(SAMPLE_MT, "utf8");
    expect(detectImportFormat(text)).toBe("mt");
  });
});

describe("runImport", () => {
  test("dry-run against minimal site", () => {
    const result = runImport({
      cwd: MINIMAL,
      input: SAMPLE_MT,
      format: "mt",
      dryRun: true,
    });
    expect(result.format).toBe("mt");
    expect(result.files.length).toBe(2);
  });

  test("writes OKF markdown to temp dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-import-"));
    try {
      const result = runImport({
        cwd: dir,
        input: SAMPLE_MT,
        format: "mt",
        out: "content/article",
      });
      expect(result.files.length).toBe(2);
      const first = result.files[0]!;
      expect(existsSync(first)).toBe(true);
      const md = readFileSync(first, "utf8");
      expect(md).toContain("type: article");
      expect(md).toContain("Hello Import");
      expect(md).toContain("<p>First paragraph");
      expect(existsSync(join(dir, ".sorane/import-manifest.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});