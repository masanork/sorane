import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig } from "../packages/core/src/config.ts";
import {
  collectAllRedirectRules,
  formatRedirectsFile,
  mergeRedirectRules,
  normalizeRedirectFrom,
  validateRedirectTarget,
} from "../packages/core/src/redirects.ts";
import { validateSiteContent } from "../packages/core/src/validate-site.ts";
import { parseConcept } from "@sorane/okf";
import { resolveI18nContext } from "../packages/core/src/i18n.ts";

describe("redirects", () => {
  test("normalizeRedirectFrom は先頭スラッシュを付与", () => {
    expect(normalizeRedirectFrom("old.html")).toBe("/old.html");
    expect(normalizeRedirectFrom("/old.html")).toBe("/old.html");
  });

  test("validateRedirectTarget は URL とパスを受け付ける", () => {
    expect(validateRedirectTarget("https://sorane.dev/new.html")).toBe(undefined);
    expect(validateRedirectTarget("/new.html")).toBe(undefined);
    expect(validateRedirectTarget("not a url")).toMatch(/path starting with/);
    expect(validateRedirectTarget("new.html")).toMatch(/path starting with/);
  });

  test("mergeRedirectRules は後勝ちで重複を検出", () => {
    const { merged, duplicates } = mergeRedirectRules([
      { from: "/a.html", to: "/b.html", status: 301 },
      { from: "/a.html", to: "https://ex.dev/b.html", status: 302 },
    ]);
    expect(duplicates).toEqual(["/a.html"]);
    expect(merged.length).toBe(1);
    expect(merged[0]!.to).toBe("https://ex.dev/b.html");
  });

  test("formatRedirectsFile は Cloudflare Pages 形式", () => {
    expect(
      formatRedirectsFile([
        { from: "/old.html", to: "https://sorane.dev/new.html", status: 301 },
      ]),
    ).toBe("/old.html https://sorane.dev/new.html 301\n");
  });

  test("collectAllRedirectRules は config と frontmatter を統合", () => {
    const config = mergeConfig({
      site: { title: "T", description: "D", base_url: "https://ex.dev", lang: "ja" },
      build: {
        content_dir: "content",
        out_dir: "dist",
        permalink: "{{slug}}.html",
        redirects: [{ from: "/config.html", to: "/dest.html" }],
      },
    });
    const i18n = resolveI18nContext(config.site);
    const parsed = [
      parseConcept(
        "",
        "stub.md",
        `---
type: article
title: Stub
redirect: https://sorane.dev/new.html
profile: sorane-okf/0.1
---
`,
        {},
      ),
    ];
    const { rules } = collectAllRedirectRules(parsed, config, i18n);
    expect(rules.length).toBe(2);
    expect(rules.find((r) => r.from === "/stub.html")?.to).toBe("https://sorane.dev/new.html");
  });
});

describe("build redirects", () => {
  function writeSite(dir: string, yamlExtra: string, contentExtra?: string): void {
    mkdirSync(join(dir, "content"), { recursive: true });
    writeFileSync(
      join(dir, "sorane.yaml"),
      `site:
  title: T
  description: D
  base_url: https://ex.dev
  lang: ja
build:
  content_dir: content
  out_dir: dist
  permalink: "{{slug}}.html"
${yamlExtra}
`,
      "utf8",
    );
    writeFileSync(
      join(dir, "content", "index.md"),
      "---\ntype: index\ntitle: Home\n---\n\nHi.\n",
      "utf8",
    );
    if (contentExtra) {
      writeFileSync(join(dir, "content", "moved.md"), contentExtra, "utf8");
    }
  }

  test("redirect frontmatter は HTML を出さず _redirects に載る", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-redirect-"));
    try {
      writeSite(
        dir,
        "",
        `---
type: article
title: Moved
redirect: https://sorane.dev/new.html
profile: sorane-okf/0.1
---
`,
      );
      await runBuild({ cwd: dir, config: {} });
      expect(existsSync(join(dir, "dist", "moved.html"))).toBe(false);
      const redirects = readFileSync(join(dir, "dist", "_redirects"), "utf8");
      expect(redirects).toBe("/moved.html https://sorane.dev/new.html 301\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("build.redirects を _redirects に出力", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-redirect-"));
    try {
      writeSite(dir, "");
      await runBuild({
        cwd: dir,
        config: {
          build: {
            content_dir: "content",
            out_dir: "dist",
            permalink: "{{slug}}.html",
            redirects: [
              {
                from: "2025-12-23-srn.html",
                to: "https://sorane.dev/2025-12-23-sorane-refactor.html",
              },
            ],
          },
        },
      });
      const redirects = readFileSync(join(dir, "dist", "_redirects"), "utf8");
      expect(redirects).toContain(
        "/2025-12-23-srn.html https://sorane.dev/2025-12-23-sorane-refactor.html 301",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("redirect 記事は feed に含めない", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-redirect-"));
    try {
      writeSite(
        dir,
        "",
        `---
type: article
title: Moved
timestamp: 2025-12-23T00:00:00Z
redirect: https://sorane.dev/new.html
profile: sorane-okf/0.1
---
`,
      );
      await runBuild({ cwd: dir, config: {} });
      const feed = readFileSync(join(dir, "dist", "feed.xml"), "utf8");
      expect(feed).not.toContain("Moved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("validate redirects", () => {
  test("重複 from は error", () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-redirect-val-"));
    try {
      mkdirSync(join(dir, "content"), { recursive: true });
      writeFileSync(
        join(dir, "sorane.yaml"),
        `site:
  title: T
  description: D
  base_url: https://ex.dev
  lang: ja
build:
  content_dir: content
  out_dir: dist
  permalink: "{{slug}}.html"
  redirects:
    - from: /dup.html
      to: https://a.example/new
    - from: dup.html
      to: https://b.example/new
`,
        "utf8",
      );
      writeFileSync(join(dir, "content", "index.md"), "---\ntype: index\ntitle: Home\n---\n", "utf8");
      const config = mergeConfig({});
      const report = validateSiteContent(dir, {
        ...config,
        site: { ...config.site, title: "T", description: "D", base_url: "https://ex.dev", lang: "ja" },
        build: {
          ...config.build,
          redirects: [
            { from: "/dup.html", to: "https://a.example/new" },
            { from: "dup.html", to: "https://b.example/new" },
          ],
        },
      });
      expect(report.ok).toBe(false);
      expect(report.files.some((f) => f.file === "sorane.yaml")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});