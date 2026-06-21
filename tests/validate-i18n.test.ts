import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { validateSiteContent } from "../packages/core/src/validate-site.ts";
import { validateI18nWarnings } from "../packages/core/src/validate-i18n.ts";

describe("validateI18nWarnings", () => {
  test("translation_key without site.i18n warns", () => {
    const warnings = validateI18nWarnings(
      [
        {
          rel: "about.md",
          source:
            "---\ntitle: A\ntype: article\ntranslation_key: about\nprofile: sorane-okf/0.1\n---\n",
        },
      ],
      { title: "T", description: "d", base_url: "", lang: "ja" },
    );
    expect(warnings.get("about.md")?.[0]?.message).toMatch(/no effect/);
  });

  test("missing translation_key sibling warns", () => {
    const warnings = validateI18nWarnings(
      [
        {
          rel: "about.md",
          source:
            "---\ntitle: JA\ntype: article\ntranslation_key: about\nprofile: sorane-okf/0.1\n---\n",
        },
      ],
      {
        title: "T",
        description: "d",
        base_url: "",
        lang: "ja",
        i18n: { locales: { en: { lang: "en", path_prefix: "en" } } },
      },
    );
    const msgs = warnings.get("about.md")?.map((w) => w.message) ?? [];
    expect(msgs.some((m) => m.includes("missing sibling"))).toBe(true);
  });

  test("mirrored path translation_key mismatch warns both sides", () => {
    const warnings = validateI18nWarnings(
      [
        {
          rel: "about.md",
          source:
            "---\ntitle: JA\ntype: article\ntranslation_key: about\nprofile: sorane-okf/0.1\n---\n",
        },
        {
          rel: "en/about.md",
          source: "---\ntitle: EN\ntype: article\nprofile: sorane-okf/0.1\n---\n",
        },
      ],
      {
        title: "T",
        description: "d",
        base_url: "",
        lang: "ja",
        i18n: { locales: { en: { lang: "en", path_prefix: "en" } } },
      },
    );
    expect((warnings.get("about.md")?.length ?? 0) >= 1).toBe(true);
    expect((warnings.get("en/about.md")?.length ?? 0) >= 1).toBe(true);
  });
});

describe("validateSiteContent i18n category", () => {
  test("integrates i18n warnings into JSON report", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-validate-i18n-"));
    const contentDir = join(root, "content");
    mkdirSync(join(contentDir, "en"), { recursive: true });
    writeFileSync(
      join(contentDir, "about.md"),
      "---\ntitle: JA\ntype: article\ntranslation_key: about\nprofile: sorane-okf/0.1\n---\n\nBody\n",
    );
    const report = validateSiteContent(
      root,
      mergeConfig({
        build: { content_dir: "content" },
        site: {
          title: "T",
          description: "d",
          base_url: "",
          lang: "ja",
          i18n: { locales: { en: { lang: "en", path_prefix: "en" } } },
        },
      } as Partial<SoraneConfig>),
    );
    const file = report.files.find((f) => f.file === "about.md");
    expect(file?.findings.some((f) => f.category === "i18n" && f.severity === "warning")).toBe(
      true,
    );
  });
});