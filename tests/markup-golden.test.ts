import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import { mdastToPandoc } from "../packages/core/src/ast/mdast-to-pandoc.ts";
import { pandocToHtml } from "../packages/core/src/ast/pandoc-to-html.ts";
import { processMarkdownToMdast } from "../packages/core/src/markup/process-markdown.ts";

const GOLDEN_DIR = join(import.meta.dirname, "../design/golden/markup");

/** PR3 までスキップする fixture（termLink 未実装）。 */
const SKIP_BASES = new Set(["2-term-link", "3-combined"]);

const ACTIVE_GOLDEN_BASES = ["0-article", "1-ruby"];

function normalizeGoldenHtml(html: string): string {
  return html.replace(/\r\n?/g, "\n").trimEnd();
}

function renderPandocPipeline(md: string): string {
  const tree = processMarkdownToMdast(md);
  const doc = mdastToPandoc(tree);
  return normalizeGoldenHtml(pandocToHtml(doc, { sanitize: "strict" }));
}

/**
 * Contract tests for design/markup-interchange.md.
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

  for (const base of ACTIVE_GOLDEN_BASES) {
    test(`mdast → pandoc → html matches golden HTML (${base})`, () => {
      const md = readFileSync(join(GOLDEN_DIR, `${base}.md`), "utf8");
      const expected = normalizeGoldenHtml(
        readFileSync(join(GOLDEN_DIR, `${base}.html`), "utf8"),
      );
      expect(renderPandocPipeline(md)).toBe(expected);
    });
  }

  test("skipped fixtures documented until PR3", () => {
    const files = readdirSync(GOLDEN_DIR).filter(
      (f) => f.endsWith(".md") && !f.startsWith("README"),
    );
    for (const md of files) {
      const base = md.replace(/\.md$/, "");
      if (ACTIVE_GOLDEN_BASES.includes(base)) continue;
      expect(SKIP_BASES.has(base)).toBe(true);
    }
  });
});