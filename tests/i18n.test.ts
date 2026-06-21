import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import type { SoraneConfig } from "../packages/core/src/config.ts";
import { buildPage } from "../packages/core/src/ssg.ts";
import {
  buildTranslationMap,
  hreflangAlternatesForPage,
  localeIdFromRelPath,
  logicalRelPath,
  resolveI18nContext,
  resolvePageLocaleInfo,
  translationGroupKey,
} from "../packages/core/src/i18n.ts";
import { mergeConfig } from "../packages/core/src/config.ts";
import { parseConcept } from "@sorane/okf";

const i18nSite: SoraneConfig["site"] = {
  title: "Test",
  description: "d",
  base_url: "https://example.test",
  lang: "ja",
  i18n: {
    locales: {
      en: { lang: "en", path_prefix: "en" },
    },
  },
};

describe("resolveI18nContext", () => {
  test("locales 無しなら disabled", () => {
    const ctx = resolveI18nContext({
      title: "T",
      description: "d",
      base_url: "",
      lang: "ja",
    });
    expect(ctx.enabled).toBe(false);
  });

  test("path_prefix の重複はエラー", () => {
    let threw = false;
    try {
      resolveI18nContext({
        title: "T",
        description: "d",
        base_url: "",
        lang: "ja",
        i18n: {
          locales: {
            en: { lang: "en", path_prefix: "en" },
            fr: { lang: "fr", path_prefix: "en" },
          },
        },
      });
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/duplicate/);
    }
    expect(threw).toBe(true);
  });
});

describe("resolvePageLocaleInfo", () => {
  const config = mergeConfig({ site: i18nSite });

  test("既定ロケールはルートに出力", () => {
    const p = parseConcept("/c/about.md", "about.md", "---\ntitle: A\ntype: article\n---\n");
    const info = resolvePageLocaleInfo(p, config, resolveI18nContext(i18nSite));
    expect(info.outRel).toBe("about.html");
    expect(info.lang).toBe("ja");
    expect(info.localeId).toBe("default");
  });

  test("en 接頭辞は en/ 配下に出力", () => {
    const p = parseConcept("/c/en/about.md", "en/about.md", "---\ntitle: A\ntype: article\n---\n");
    const ctx = resolveI18nContext(i18nSite);
    expect(localeIdFromRelPath(p.relPath, ctx)).toBe("en");
    expect(logicalRelPath(p.relPath, ctx)).toBe("about.md");
    const info = resolvePageLocaleInfo(p, config, ctx);
    expect(info.outRel).toBe("en/about.html");
    expect(info.lang).toBe("en");
  });

  test("translation_key でグループ化", () => {
    const ctx = resolveI18nContext(i18nSite);
    const ja = parseConcept(
      "/c/about.md",
      "about.md",
      "---\ntitle: JA\ntype: article\ntranslation_key: about\n---\n",
    );
    const en = parseConcept(
      "/c/en/info.md",
      "en/info.md",
      "---\ntitle: EN\ntype: article\ntranslation_key: about\n---\n",
    );
    expect(translationGroupKey(ja, ctx)).toBe("key:about");
    expect(translationGroupKey(en, ctx)).toBe("key:about");
  });
});

describe("hreflangAlternatesForPage", () => {
  test("兄弟翻訳と x-default を返す", () => {
    const config = mergeConfig({ site: i18nSite });
    const ctx = resolveI18nContext(i18nSite);
    const parsed = [
      parseConcept("/c/about.md", "about.md", "---\ntitle: JA\ntype: article\n---\n"),
      parseConcept("/c/en/about.md", "en/about.md", "---\ntitle: EN\ntype: article\n---\n"),
    ];
    const map = buildTranslationMap(parsed, config, ctx);
    const group = translationGroupKey(parsed[0]!, ctx);
    const alts = hreflangAlternatesForPage(group, "default", map, "https://ex.test", ctx);
    expect(alts.some((a) => a.hreflang === "ja")).toBe(true);
    expect(alts.some((a) => a.hreflang === "en")).toBe(true);
    expect(alts.some((a) => a.hreflang === "x-default")).toBe(true);
    expect(alts.find((a) => a.hreflang === "en")?.href).toBe("https://ex.test/en/about.html");
  });
});

describe("buildPage hreflang", () => {
  test("hreflang と og:locale:alternate を head に出す", () => {
    const html = buildPage({
      title: "About",
      siteTitle: "Site",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      lang: "ja",
      canonicalUrl: "https://ex.test/about.html",
      hreflangAlternates: [
        { hreflang: "ja", href: "https://ex.test/about.html" },
        { hreflang: "en", href: "https://ex.test/en/about.html" },
        { hreflang: "x-default", href: "https://ex.test/about.html" },
      ],
      ogLocaleAlternates: ["en_US"],
    });
    expect(html).toContain('hreflang="ja"');
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('property="og:locale:alternate" content="en_US"');
    expect(html).toContain('<html lang="ja">');
  });
});

describe("runBuild i18n", () => {
  test("JA + EN ページを hreflang 付きで焼く", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-i18n-"));
    const contentDir = join(tmp, "content");
    mkdirSync(join(contentDir, "en"), { recursive: true });
    writeFileSync(
      join(contentDir, "about.md"),
      "---\ntitle: 概要\ntype: article\ntimestamp: 2025-06-01T00:00:00Z\nprofile: sorane-okf/0.1\n---\n\n本文\n",
    );
    writeFileSync(
      join(contentDir, "en/about.md"),
      "---\ntitle: About\ntype: article\ntimestamp: 2025-06-01T00:00:00Z\nprofile: sorane-okf/0.1\n---\n\nBody\n",
    );
    try {
      const result = await runBuild({
        cwd: tmp,
        config: {
          site: i18nSite,
          build: { content_dir: "content", out_dir: join(tmp, "dist") },
        } as Partial<SoraneConfig>,
        clean: true,
      });
      expect(result.pages >= 2).toBe(true);
      expect(existsSync(join(tmp, "dist/about.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/en/about.html"))).toBe(true);

      const jaHtml = readFileSync(join(tmp, "dist/about.html"), "utf8");
      const enHtml = readFileSync(join(tmp, "dist/en/about.html"), "utf8");
      expect(jaHtml).toContain('<html lang="ja">');
      expect(enHtml).toContain('<html lang="en">');
      expect(jaHtml).toContain('hreflang="en"');
      expect(jaHtml).toContain('hreflang="x-default"');
      expect(enHtml).toContain('hreflang="ja"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});