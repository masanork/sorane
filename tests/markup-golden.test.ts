import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";

const GOLDEN_DIR = join(import.meta.dirname, "../design/golden/markup");

/**
 * Contract tests for design/markup-interchange.md.
 * Implementation lands in PR1 (pandoc hub); until then this file documents expected cases.
 */
describe("markup golden fixtures", () => {
  test("golden directory contains paired md/html fixtures", () => {
    const files = readdirSync(GOLDEN_DIR).filter(
      (f) => f.endsWith(".md") && !f.startsWith("README"),
    );
    expect(files.length >= 3).toBe(true);
    for (const md of files) {
      const base = md.replace(/\.md$/, "");
      const htmlPath = join(GOLDEN_DIR, `${base}.html`);
      expect(existsSync(htmlPath)).toBe(true);
    }
  });

  test.skip("mdast → pandoc → html matches golden HTML", () => {
    // PR1: import processMarkdownToMdast, mdastToPandoc, pandocToHtml
    // for (const base of bases) { ... expect(normalize(html)).toBe(expected) }
  });
});