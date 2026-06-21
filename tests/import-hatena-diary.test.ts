import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { parseHatenaDiaryExport } from "../packages/core/src/import/adapters/hatena-diary.ts";
import { detectImportFormat } from "../packages/core/src/import/detect-format.ts";
import { runImport } from "../packages/core/src/import/run-import.ts";
import { decodeXmlContent } from "../packages/core/src/import/atom-parse.ts";

const SAMPLE = join(import.meta.dirname, "fixtures/import/sample-hatena-diary.atom.xml");
const MINIMAL = join(import.meta.dirname, "../examples/minimal");

describe("decodeXmlContent", () => {
  test("CDATA と実体参照", () => {
    expect(decodeXmlContent("<![CDATA[<p>ok</p>]]>")).toBe("<p>ok</p>");
    expect(decodeXmlContent("&lt;p&gt;&amp;&quot;")).toBe('<p>&"');
  });
});

describe("parseHatenaDiaryExport", () => {
  test("sample fixture → 2 published entries", () => {
    const text = readFileSync(SAMPLE, "utf8");
    const entries = parseHatenaDiaryExport(text);
    expect(entries.length).toBe(2);
    expect(entries[0]!.title).toBe("公開エントリ");
    expect(entries[0]!.body).toContain("はてな本文");
    expect(entries[0]!.categories).toEqual(["雑記"]);
    expect(entries[1]!.body).toContain("記法");
  });

  test("include drafts", () => {
    const text = readFileSync(SAMPLE, "utf8");
    const entries = parseHatenaDiaryExport(text, { skipDrafts: false });
    expect(entries.length).toBe(3);
    expect(entries[1]!.status).toBe("draft");
  });
});

describe("detectImportFormat hatena-diary", () => {
  test("sample atom file", () => {
    const text = readFileSync(SAMPLE, "utf8");
    expect(detectImportFormat(text)).toBe("hatena-diary");
  });
});

describe("runImport hatena-diary", () => {
  test("dry-run via auto format", () => {
    const result = runImport({
      cwd: MINIMAL,
      input: SAMPLE,
      format: "auto",
      dryRun: true,
    });
    expect(result.format).toBe("hatena-diary");
    expect(result.files.length).toBe(2);
  });

  test("writes OKF markdown to temp dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-hatena-import-"));
    try {
      const result = runImport({
        cwd: dir,
        input: SAMPLE,
        format: "hatena-diary",
        out: "content/article",
      });
      expect(result.files.length).toBe(2);
      const first = result.files[0]!;
      expect(existsSync(first)).toBe(true);
      const md = readFileSync(first, "utf8");
      expect(md).toContain("type: article");
      expect(md).toContain("公開エントリ");
      expect(md).toContain("はてな本文");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});