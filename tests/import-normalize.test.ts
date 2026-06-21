import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import {
  applyGlyphSubstitution,
  loadGlyphSubstitutionMap,
  parseGjsSubstituteMap,
} from "../packages/core/src/import/glyph-map.ts";
import { normalizeHatenaKeywordLinks } from "../packages/core/src/import/normalize-html.ts";
import { normalizeImportBody } from "../packages/core/src/import/normalize-body.ts";
import { runImport } from "../packages/core/src/import/run-import.ts";

const GLYPH_MAP = join(import.meta.dirname, "fixtures/import/glyph-map-minimal.tsv");
const HATENA = join(import.meta.dirname, "fixtures/import/sample-hatena-diary.atom.xml");

describe("normalizeHatenaKeywordLinks", () => {
  test("class=keyword", () => {
    const html =
      '<p><a class="keyword" href="http://d.hatena.ne.jp/keyword/test">性的指向</a>です</p>';
    expect(normalizeHatenaKeywordLinks(html)).toBe("<p>性的指向です</p>");
  });

  test("class=okeyword", () => {
    const html = '<a class="okeyword" href="g:mohican:keyword:なるほど">なるほど</a>';
    expect(normalizeHatenaKeywordLinks(html)).toBe("なるほど");
  });

  test("href fallback without class", () => {
    const html =
      '<a href="https://d.hatena.ne.jp/keyword/mixi">mixi</a>';
    expect(normalizeHatenaKeywordLinks(html)).toBe("mixi");
  });
});

describe("glyph substitution map", () => {
  test("minimal fixture", () => {
    const map = loadGlyphSubstitutionMap(GLYPH_MAP);
    expect(map.size).toBe(2);
    expect(applyGlyphSubstitution("齋斎斉", map)).toBe("斎斎斉");
  });

  test("parse skips type 0", () => {
    const map = parseGjsSubstituteMap("U+0041\tU+0041\t0\nU+0042\tU+0043\t1\n");
    expect(map.size).toBe(1);
    expect(applyGlyphSubstitution("AB", map)).toBe("AC");
  });
});

describe("runImport normalize", () => {
  test("hatena import strips keyword links by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-import-norm-"));
    try {
      const result = runImport({
        cwd: dir,
        input: HATENA,
        format: "hatena-diary",
        out: "content/article",
      });
      expect(result.files.length >= 1).toBe(true);
      const md = readFileSync(result.files[0]!, "utf8");
      expect(md.includes('class="keyword"')).toBe(false);
      expect(md.includes("hatena.ne.jp/keyword")).toBe(false);
      expect(md).toContain("キーワード");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("normalizeHtml: false preserves keyword anchors", () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-import-raw-"));
    try {
      const result = runImport({
        cwd: dir,
        input: HATENA,
        format: "hatena-diary",
        out: "content/article",
        normalizeHtml: false,
      });
      const md = readFileSync(result.files[0]!, "utf8");
      expect(md).toContain('class="keyword"');
      expect(md).toContain("hatena.ne.jp/keyword");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("glyph-map rewrites body on import", () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-import-glyph-"));
    const wxr = join(dir, "one.wxr.xml");
    writeFileSync(
      wxr,
      `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><generator>https://wordpress.com/export/1.2/</generator>
<item>
<title>Glyph test</title><guid>https://example.com/?p=9</guid>
<content:encoded><![CDATA[<p>旧字体齋</p>]]></content:encoded>
<wp:post_date>2012-04-01 10:00:00</wp:post_date><wp:post_type>post</wp:post_type><wp:status>publish</wp:status>
</item></channel></rss>`,
      "utf8",
    );
    try {
      runImport({
        cwd: dir,
        input: wxr,
        format: "wordpress",
        out: "content/article",
        normalizeHtml: false,
        glyphMapPath: GLYPH_MAP,
      });
      const md = readFileSync(join(dir, "content/article/2012-04-01-glyph-test.md"), "utf8");
      expect(md).toContain("旧字体斎");
      expect(md.includes("齋")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("glyph map applied when configured", () => {
    const body = normalizeImportBody("旧字体齋", {
      normalizeHtml: false,
      glyphMap: loadGlyphSubstitutionMap(GLYPH_MAP),
    });
    expect(body).toBe("旧字体斎");
  });
});