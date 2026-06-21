import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import type { SoraneConfig } from "../packages/core/src/config.ts";
import { loadSoraneConfig } from "../packages/cli/src/config-load.ts";

function writeSite(root: string, config: Partial<SoraneConfig>, files: Record<string, string>) {
  mkdirSync(join(root, "content"), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, "content", rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  writeFileSync(
    join(root, "sorane.yaml"),
    `site:\n  title: ${config.site?.title ?? "Site"}\n  description: ${config.site?.description ?? "desc"}\n  base_url: "${config.site?.base_url ?? "https://ex.dev"}"\n  lang: ${config.site?.lang ?? "ja"}\n  og_image: /assets/og.png\n` +
      (config.docs?.nav
        ? `docs:\n  nav:\n${config.docs.nav.map((n) => (typeof n === "string" ? `    - ${n}` : `    - href: ${n.href}\n      title: ${n.title}`)).join("\n")}\n`
        : "") +
      `build:\n  content_dir: content\n  out_dir: dist\n  permalink: "{{slug}}.html"\n` +
      (config.build?.blog
        ? `  blog:\n    page_size: ${config.build.blog.page_size ?? 2}\n    featured_mode: ${config.build.blog.featured_mode ?? "full"}\n    show_list_descriptions: true\n    archives: true\n    tags: true\n`
        : "") +
      (config.build?.ai_disclosure
        ? `  ai_disclosure:\n    enabled: true\n    badges: true\n    json_ld: true\n    show_on_lists: true\n`
        : ""),
    "utf8",
  );
}

const INDEX = `---
type: index
title: Docs Home
profile: sorane-okf/0.3
profileUrl: ./about.html
githubUrl: https://github.com/example/sorane
---

# Docs Home

Welcome to the docs.
`;

const ARTICLE = (slug: string, date: string, extra = "") => `---
type: article
title: Post ${slug}
timestamp: ${date}T00:00:00Z
profile: sorane-okf/0.3
tags: [alpha, beta]
${extra}
---

Body for ${slug}.
`;

describe("runBuild rich site", () => {
  test("docs モード・ページネーション・アーカイブ・タグ", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-rich-"));
    const outDir = join(root, "dist");
    writeSite(
      root,
      {
        site: { title: "Rich", description: "d", base_url: "https://ex.dev", lang: "ja" },
        docs: {
          nav: [
            { href: "index.html", title: "Home" },
            { href: "guide.html", title: "Guide" },
            { href: "api.html", title: "API" },
          ],
        },
        build: {
          content_dir: "content",
          out_dir: "dist",
          permalink: "{{slug}}.html",
          blog: { page_size: 1, featured_mode: "full" },
        },
      },
      {
        "index.md": INDEX,
        "guide.md": `---
type: article
title: Guide
profile: sorane-okf/0.3
excludeFromList: true
---

## Section One

Guide body.

## Section Two

More content.
`,
        "api.md": `---
type: reference
title: API Reference
profile: sorane-okf/0.3
---

API fields.
`,
        "faq.md": `---
type: faq
title: FAQ
profile: sorane-okf/0.3
---

## First?
Answer one.

## Second?
Answer two.
`,
        "glossary.md": `---
type: glossary
title: Glossary
profile: sorane-okf/0.3
---

## Alpha {#alpha}
First term.

## Beta {#beta}
Second term.
`,
        "2025-03-01-a.md": ARTICLE("a", "2025-03-01", "digitalSourceType: trainedAlgorithmicMedia"),
        "2025-02-01-b.md": ARTICLE("b", "2025-02-01"),
        "2025-01-01-c.md": ARTICLE("c", "2025-01-01"),
        "2024-12-01-d.md": ARTICLE("d", "2024-12-01"),
        "search.md": `---
type: article
title: Search
profile: sorane-okf/0.3
view: search
---

Search intro.
`,
      },
    );
    try {
      const result = await runBuild({
        cwd: root,
        config: { ...loadSoraneConfig(root), build: { ...loadSoraneConfig(root).build, out_dir: outDir } },
        clean: true,
        skipC2pa: true,
      });
      expect(result.pages >= 8).toBe(true);
      expect(existsSync(join(outDir, "index.html"))).toBe(true);
      expect(existsSync(join(outDir, "page/2.html"))).toBe(true);
      expect(existsSync(join(outDir, "archive/index.html"))).toBe(true);
      expect(existsSync(join(outDir, "archive/2025.html"))).toBe(true);
      expect(existsSync(join(outDir, "tag/alpha.html"))).toBe(true);
      expect(existsSync(join(outDir, "search.html"))).toBe(true);

      const indexHtml = readFileSync(join(outDir, "index.html"), "utf8");
      expect(indexHtml).toContain("docs-layout");
      expect(indexHtml).toContain("docs-index");

      const guideHtml = readFileSync(join(outDir, "guide.html"), "utf8");
      expect(guideHtml).toContain("page-toc");

      const apiHtml = readFileSync(join(outDir, "api.html"), "utf8");
      expect(apiHtml).toContain("TechArticle");

      const searchHtml = readFileSync(join(outDir, "search.html"), "utf8");
      expect(searchHtml).toContain('class="search"');

      const faqHtml = readFileSync(join(outDir, "faq.html"), "utf8");
      expect(faqHtml).toContain('class="faq-page"');
      expect(faqHtml).toContain("mainEntity");
      expect(faqHtml).toContain("First?");

      const glossaryHtml = readFileSync(join(outDir, "glossary.html"), "utf8");
      expect(glossaryHtml).toContain('class="glossary-page"');
      expect(glossaryHtml).toContain("hasDefinedTerm");
      expect(glossaryHtml).toContain('id="alpha"');

      const catalog = readFileSync(join(outDir, "catalog.jsonld"), "utf8");
      expect(catalog).toContain("FAQPage");
      expect(catalog).toContain("DefinedTermSet");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("static/404.html を優先", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-static-404-"));
    const outDir = join(root, "dist");
    mkdirSync(join(root, "static"), { recursive: true });
    writeFileSync(join(root, "static", "404.html"), "<!DOCTYPE html><html><body>Static 404</body></html>", "utf8");
    writeSite(
      root,
      { site: { title: "T", description: "d", lang: "en", base_url: "" } },
      { "index.md": INDEX },
    );
    try {
      await runBuild({
        cwd: root,
        config: { ...loadSoraneConfig(root), build: { ...loadSoraneConfig(root).build, out_dir: outDir } },
        clean: true,
        skipC2pa: true,
      });
      const html = readFileSync(join(outDir, "404.html"), "utf8");
      expect(html).toContain("Static 404");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("en サイトで空タイトル 404 は英語ラベル", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-404-en-"));
    const outDir = join(root, "dist");
    writeSite(
      root,
      { site: { title: "T", description: "d", lang: "en", base_url: "" } },
      {
        "index.md": INDEX,
        "404.md": `---
type: article
title: "   "
profile: sorane-okf/0.1
---

Custom body only.
`,
      },
    );
    try {
      await runBuild({
        cwd: root,
        config: { ...loadSoraneConfig(root), build: { ...loadSoraneConfig(root).build, out_dir: outDir } },
        clean: true,
        skipC2pa: true,
      });
      const html = readFileSync(join(outDir, "404.html"), "utf8");
      expect(html).toContain("<h1>404</h1>");
      expect(html).toContain("Custom body only.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("findability: organization, breadcrumb, search action, lastmod", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-find-"));
    const outDir = join(root, "dist");
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "sorane.yaml"),
      [
        "site:",
        "  title: Gov Site",
        '  description: "d"',
        '  base_url: "https://gov.ex"',
        "  lang: ja",
        "  organization:",
        "    name: Example Agency",
        '    url: "https://www.example.go.jp/"',
        "    type: GovernmentOrganization",
        "  contact:",
        "    email: info@example.go.jp",
        "build:",
        "  content_dir: content",
        "  out_dir: dist",
        '  permalink: "{{slug}}.html"',
        "search:",
        "  index: .sorane/index.db",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(root, "content", "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nHome.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "content", "guide.md"),
      "---\ntype: article\ntitle: Guide\ntimestamp: 2025-01-01T00:00:00Z\nupdated: 2025-06-15\nprofile: sorane-okf/0.1\nidentifier: GOV-1\n---\n\nGuide body.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "content", "search.md"),
      "---\ntype: article\ntitle: Search\nview: search\nprofile: sorane-okf/0.1\n---\n\nSearch.\n",
      "utf8",
    );
    try {
      const { runIndexCmd } = await import("../packages/cli/src/index-cmd.ts");
      await runIndexCmd(["--cwd", root, "--force", "--fts-only"]);
      await runBuild({
        cwd: root,
        config: loadSoraneConfig(root),
        clean: true,
        skipC2pa: true,
      });
      const indexHtml = readFileSync(join(outDir, "index.html"), "utf8");
      expect(indexHtml).toContain("GovernmentOrganization");
      expect(indexHtml).toContain("SearchAction");
      const guideHtml = readFileSync(join(outDir, "guide.html"), "utf8");
      expect(guideHtml).toContain("BreadcrumbList");
      expect(guideHtml).toContain("GOV-1");
      const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf8");
      expect(sitemap).toContain("<lastmod>2025-06-15</lastmod>");
      const llms = readFileSync(join(outDir, "llms.txt"), "utf8");
      expect(llms).toContain("## Publisher");
      expect(llms).toContain("info@example.go.jp");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});