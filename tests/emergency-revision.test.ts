import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import type { SoraneConfig } from "../packages/core/src/config.ts";
import { buildPage } from "../packages/core/src/ssg.ts";
import {
  emergencyBannerHtml,
  resolveEmergencyBanner,
} from "../packages/core/src/emergency-banner.ts";
import {
  parseRevisionHistory,
  revisionHistoryHtml,
  validateRevisionFindings,
} from "../packages/core/src/revision-history.ts";
import { validateSiteContent } from "../packages/core/src/validate-site.ts";
import { mergeConfig } from "../packages/core/src/config.ts";

describe("resolveEmergencyBanner", () => {
  test("message 無しなら undefined", () => {
    expect(
      resolveEmergencyBanner(
        { title: "T", description: "d", base_url: "", lang: "ja", emergency: {} },
        "default",
      ),
    ).toBe(undefined);
  });

  test("ロケール別メッセージ", () => {
    const banner = resolveEmergencyBanner(
      {
        title: "T",
        description: "d",
        base_url: "",
        lang: "ja",
        emergency: {
          message: "日本語",
          locales: { en: { message: "English alert" } },
        },
      },
      "en",
    );
    expect(banner?.message).toBe("English alert");
  });
});

describe("emergencyBannerHtml", () => {
  test("role=alert と severity クラス", () => {
    const html = emergencyBannerHtml(
      { message: "Alert", severity: "emergency", href: "https://ex.test/", linkText: "More" },
      "ja",
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("emergency-banner--emergency");
    expect(html).toContain("Alert");
    expect(html).toContain('href="https://ex.test/"');
  });
});

describe("revision history", () => {
  test("revisions をパースしてテーブルを出す", () => {
    const entries = parseRevisionHistory({
      revisions: [
        { date: "2025-06-02", summary: "修正" },
        { date: "2025-06-01", note: "初版" },
      ],
    });
    expect(entries.length).toBe(2);
    const html = revisionHistoryHtml(entries, "ja");
    expect(html).toContain("更新履歴");
    expect(html).toContain("2025-06-02");
    expect(html).toContain("修正");
    expect(html).toContain('<table class="revision-history-table">');
  });

  test("日付順 warning", () => {
    const findings = validateRevisionFindings({
      revisions: [
        { date: "2025-06-01", summary: "old" },
        { date: "2025-06-15", summary: "newer after older" },
      ],
    });
    expect(findings.some((f) => f.message.includes("newest-first"))).toBe(true);
  });
});

describe("buildPage emergency banner", () => {
  test("skip link の直後にバナーを挿入", () => {
    const html = buildPage({
      title: "T",
      siteTitle: "S",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      lang: "ja",
      emergencyBannerHtml:
        '<div class="emergency-banner emergency-banner--warning" role="alert"><p>!</p></div>',
    });
    const skipIdx = html.indexOf("skip-link");
    const bannerIdx = html.indexOf("emergency-banner");
    const headerIdx = html.indexOf("site-header");
    expect(skipIdx > -1).toBe(true);
    expect(bannerIdx > skipIdx).toBe(true);
    expect(headerIdx > bannerIdx).toBe(true);
  });
});

describe("runBuild emergency + revisions", () => {
  test("バナーと更新履歴を焼く", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-ops-"));
    const contentDir = join(tmp, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "notice.md"),
      [
        "---",
        "type: article",
        "title: お知らせ",
        "timestamp: 2025-06-01T00:00:00Z",
        "profile: sorane-okf/0.1",
        "revisions:",
        "  - date: 2025-06-10",
        "    summary: 表記を更新",
        "  - date: 2025-06-01",
        "    summary: 公開",
        "---",
        "",
        "本文",
      ].join("\n"),
    );

    try {
      await runBuild({
        cwd: tmp,
        config: {
          site: {
            title: "Test",
            description: "d",
            base_url: "https://example.test",
            lang: "ja",
            emergency: {
              message: "テスト告知",
              severity: "info",
            },
          },
          build: { content_dir: "content", out_dir: join(tmp, "dist") },
        } as Partial<SoraneConfig>,
        clean: true,
      });

      const html = readFileSync(join(tmp, "dist/notice.html"), "utf8");
      expect(html).toContain('role="alert"');
      expect(html).toContain("テスト告知");
      expect(html).toContain("更新履歴");
      expect(html).toContain("表記を更新");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("validateSiteContent revision", () => {
  test("不正 revisions は revision category", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-rev-val-"));
    const contentDir = join(tmp, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "bad.md"),
      "---\ntype: article\ntitle: X\ntimestamp: 2025-06-01T00:00:00Z\nprofile: sorane-okf/0.1\nrevisions: not-array\n---\n\nBody\n",
    );
    try {
      const report = validateSiteContent(
        tmp,
        mergeConfig({ build: { content_dir: "content" } } as Partial<SoraneConfig>),
      );
      const file = report.files.find((f) => f.file === "bad.md");
      expect(file?.findings.some((x) => x.category === "revision")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});