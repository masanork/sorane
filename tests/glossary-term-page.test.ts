import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import {
  buildGlossaryTermJsonLd,
  renderGlossaryTermIndexBody,
  renderGlossaryTermPageBody,
  resolveGlossaryTermMeta,
  validateGlossaryTermWarnings,
} from "../packages/core/src/glossary-term-page.ts";
import { normalizeConcept } from "@sorane/okf";

describe("resolveGlossaryTermMeta", () => {
  test("term_id と inDefinedTermSet を読む", () => {
    const meta = resolveGlossaryTermMeta({
      term_id: "csv",
      glossary: "glossary/stats.html",
      seeAlso: ["/other.html"],
    });
    expect(meta.termId).toBe("csv");
    expect(meta.inDefinedTermSet).toBe("glossary/stats.html");
    expect(meta.seeAlso?.length).toBe(1);
  });
});

describe("validateGlossaryTermWarnings", () => {
  test("空本文と推奨フィールド欠落を警告", () => {
    const warnings = validateGlossaryTermWarnings("", {});
    expect(warnings.some((w) => w.includes("empty body"))).toBe(true);
    expect(warnings.some((w) => w.includes("term_id"))).toBe(true);
    expect(warnings.some((w) => w.includes("inDefinedTermSet"))).toBe(true);
  });
});

describe("renderGlossaryTermPageBody", () => {
  test("単一用語ページを描画", () => {
    const concept = normalizeConcept(
      {
        type: "glossary-term",
        title: "CSV",
        profile: "sorane-okf/0.3",
        term_id: "csv",
        glossary: "glossary.html",
      },
      "Comma-separated values.",
      "csv",
    );
    const html = renderGlossaryTermPageBody(
      concept,
      "<p>Comma-separated values.</p>",
      resolveGlossaryTermMeta(concept.frontmatter),
    );
    expect(html).toContain('class="glossary-term-page"');
    expect(html).toContain('id="csv"');
    expect(html).toContain("glossary.html");
  });
});

describe("buildGlossaryTermJsonLd", () => {
  test("DefinedTerm JSON-LD", () => {
    const script = buildGlossaryTermJsonLd({
      title: "CSV",
      url: "https://ex.dev/glossary/terms/csv.html",
      siteTitle: "Site",
      lang: "en",
      termId: "csv",
      inDefinedTermSet: "https://ex.dev/glossary.html",
      definitionHtml: "<p>Comma-separated values.</p>",
      definitionMarkdown: "Comma-separated values.",
    });
    expect(script).toContain("DefinedTerm");
    expect(script).toContain('"termCode":"csv"');
    expect(script).toContain("inDefinedTermSet");
  });
});

describe("renderGlossaryTermIndexBody", () => {
  test("用語一覧リンク", () => {
    const html = renderGlossaryTermIndexBody("Site", [
      { title: "CSV", href: "glossary/terms/csv.html", parentHref: "glossary.html" },
    ]);
    expect(html).toContain("Glossary terms");
    expect(html).toContain("csv.html");
  });
});

describe("runBuild glossary-term", () => {
  test("用語ページと terms index を生成", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-glossary-term-"));
    const contentDir = join(tmp, "content", "glossary", "terms");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "alpha.md"),
      "---\ntype: glossary-term\ntitle: Alpha\nprofile: sorane-okf/0.3\nterm_id: alpha\nglossary: glossary.html\n---\n\nFirst term.\n",
    );
    try {
      await runBuild({
        cwd: tmp,
        config: mergeConfig({
          build: { content_dir: "content", out_dir: join(tmp, "dist") },
        } as Partial<SoraneConfig>),
        clean: true,
      });
      expect(readFileSync(join(tmp, "dist/alpha.html"), "utf8")).toContain("Alpha");
      const index = readFileSync(join(tmp, "dist/glossary/terms/index.html"), "utf8");
      expect(index).toContain("alpha.html");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});