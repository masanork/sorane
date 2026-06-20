import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import { DEFAULT_CONFIG, mergeConfig, resolvePermalink } from "../packages/core/src/config.ts";
import { loadSoraneConfig, parseCwdFlag } from "../packages/cli/src/config-load.ts";

describe("mergeConfig", () => {
  test("未指定は DEFAULT を使う", () => {
    const cfg = mergeConfig({});
    expect(cfg.site.title).toBe(DEFAULT_CONFIG.site.title);
    expect(cfg.fonts.enabled).toBe(false);
  });

  test("部分上書き", () => {
    const cfg = mergeConfig({ site: { title: "X", description: "d", base_url: "https://x", lang: "en" } });
    expect(cfg.site.title).toBe("X");
    expect(cfg.site.lang).toBe("en");
  });

  test("ai_disclosure を deep merge する", () => {
    const cfg = mergeConfig({
      build: {
        content_dir: "content",
        out_dir: "dist",
        permalink: "{{slug}}.html",
        ai_disclosure: { show_on_lists: true, json_ld: false },
      },
    });
    expect(cfg.build.ai_disclosure?.show_on_lists).toBe(true);
    expect(cfg.build.ai_disclosure?.json_ld).toBe(false);
    expect(cfg.build.ai_disclosure?.enabled).toBe(undefined);
  });
});

describe("resolvePermalink", () => {
  test("slug テンプレートを展開", () => {
    expect(resolvePermalink("{{slug}}.html", "post", "2025-01-01T00:00:00Z")).toBe("post.html");
    expect(resolvePermalink("{{date}}-{{slug}}.html", "post", "2025-01-01T00:00:00Z")).toBe("2025-01-01-post.html");
  });
});

describe("loadSoraneConfig", () => {
  test("sorane.yaml が無ければ既定", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-cfg-"));
    try {
      const cfg = loadSoraneConfig(tmp);
      expect(cfg.build.content_dir).toBe("content");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("不正 YAML はエラー", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-cfg-"));
    try {
      writeFileSync(join(tmp, "sorane.yaml"), "- not-a-map\n");
      let threw = false;
      try {
        loadSoraneConfig(tmp);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("parseCwdFlag", () => {
  test("--cwd を解決する", () => {
    const cwd = parseCwdFlag(["node", "sorane", "--cwd", "/tmp/blog"]);
    expect(cwd.endsWith("/tmp/blog") || cwd.endsWith("\\tmp\\blog")).toBe(true);
  });

  test("未指定は process.cwd", () => {
    expect(parseCwdFlag(["node", "sorane"])).toBe(process.cwd());
  });
});