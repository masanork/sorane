import { describe, expect, test } from "./_expect.ts";
import {
  validateContentQualityFindings,
  validateDateFindings,
  validateImageAltFindings,
  validateLinkTextFindings,
  validateTableFindings,
} from "../packages/core/src/validate-content-quality.ts";
import { validateSiteContent } from "../packages/core/src/validate-site.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("validateImageAltFindings", () => {
  test("空 alt を検出", () => {
    const f = validateImageAltFindings("![](hero.png)");
    expect(f.length).toBe(1);
    expect(f[0]!.category).toBe("image");
  });

  test("フェンス内は無視", () => {
    expect(validateImageAltFindings("```\n![](x.png)\n```").length).toBe(0);
  });

  test("インラインコード内は無視", () => {
    expect(validateImageAltFindings("Use `![](path)` syntax.").length).toBe(0);
  });
});

describe("validateLinkTextFindings", () => {
  test("こちら を検出", () => {
    const f = validateLinkTextFindings("[こちら](https://ex.dev)");
    expect(f.length).toBe(1);
    expect(f[0]!.category).toBe("link");
  });

  test("アンカーは無視", () => {
    expect(validateLinkTextFindings("[こちら](#sec)").length).toBe(0);
  });

  test("コード風ラベルは許容", () => {
    expect(
      validateLinkTextFindings("[`template/site/`](https://github.com/example)").length,
    ).toBe(0);
  });
});

describe("validateTableFindings", () => {
  test("区切り行無し", () => {
    const f = validateTableFindings("| A | B |\n| 1 | 2 |");
    expect(f.some((x) => x.message.includes("separator"))).toBe(true);
  });

  test("空ヘッダセル", () => {
    const f = validateTableFindings("| A | |\n| --- | --- |\n| 1 | 2 |");
    expect(f.some((x) => x.message.includes("empty"))).toBe(true);
  });
});

describe("validateDateFindings", () => {
  test("updated が timestamp より前", () => {
    const f = validateDateFindings({
      timestamp: "2025-06-01",
      updated: "2025-01-01",
    });
    expect(f.length).toBe(1);
    expect(f[0]!.category).toBe("date");
  });
});

describe("validateSiteContent quality integration", () => {
  test("品質 warning の category", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-quality-"));
    const contentDir = join(root, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "bad.md"),
      "---\ntype: article\ntitle: T\nprofile: sorane-okf/0.1\n---\n\n![](x.png)\n\n[こちら](https://ex.dev)\n",
      "utf8",
    );
    try {
      const report = validateSiteContent(
        root,
        mergeConfig({ build: { content_dir: "content" } } as Partial<SoraneConfig>),
      );
      expect(report.ok).toBe(true);
      const file = report.files.find((f) => f.file === "bad.md");
      expect(file?.findings.some((f) => f.category === "image")).toBe(true);
      expect(file?.findings.some((f) => f.category === "link")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("quality ゲート無効化", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-quality-off-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "x.md"),
      "---\ntype: article\ntitle: T\nprofile: sorane-okf/0.1\n---\n\n![](x.png)\n",
      "utf8",
    );
    try {
      const report = validateSiteContent(
        root,
        mergeConfig({
          build: { content_dir: "content", quality: { image_alt: false } },
        } as Partial<SoraneConfig>),
      );
      const file = report.files.find((f) => f.file === "x.md");
      expect(file?.findings.some((f) => f.category === "image")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});