import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { loadSoraneConfig } from "../packages/cli/src/config-load.ts";
import { exportMarkdownBodyToDocx, runDocxExport } from "../packages/core/src/export/docx.ts";
import { pandocCliAvailable } from "../packages/core/src/export/pandoc-cli.ts";

const GOLDEN_ARTICLE = join(import.meta.dirname, "../design/golden/markup/0-article.md");
const GOLDEN_RUBY = join(import.meta.dirname, "../design/golden/markup/1-ruby.md");
const MINIMAL = join(import.meta.dirname, "../examples/minimal");

describe("exportMarkdownBodyToDocx", () => {
  test("0-article golden → docx smoke", () => {
    if (!pandocCliAvailable()) return;
    const dir = mkdtempSync(join(tmpdir(), "sorane-docx-"));
    const out = join(dir, "article.docx");
    try {
      exportMarkdownBodyToDocx(readFileSync(GOLDEN_ARTICLE, "utf8"), out);
      expect(existsSync(out)).toBe(true);
      expect(statSync(out).size >= 1000).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ruby 本文を含む docx を生成", () => {
    if (!pandocCliAvailable()) return;
    const dir = mkdtempSync(join(tmpdir(), "sorane-docx-ruby-"));
    const out = join(dir, "ruby.docx");
    try {
      exportMarkdownBodyToDocx(readFileSync(GOLDEN_RUBY, "utf8"), out);
      expect(statSync(out).size >= 1000).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runDocxExport", () => {
  test("minimal サイトの単一ページ export", () => {
    if (!pandocCliAvailable()) return;
    const dir = mkdtempSync(join(tmpdir(), "sorane-docx-site-"));
    const out = join(dir, "hello.docx");
    try {
      const result = runDocxExport({
        cwd: MINIMAL,
        config: loadSoraneConfig(MINIMAL),
        out,
        file: "article/2025-01-01-hello.md",
      });
      expect(result.files.length).toBe(1);
      expect(existsSync(out)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});