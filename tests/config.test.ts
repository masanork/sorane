import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  DEFAULT_CONFIG,
  mergeConfig,
  resolvePermalink,
} from "../packages/core/src/config.ts";
import { resolveBuildOutputs } from "../packages/core/src/presets.ts";
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

  test("preset okf-site は機械可読出力を有効にする", () => {
    const cfg = mergeConfig({ preset: "okf-site" });
    const out = resolveBuildOutputs(cfg.build.outputs);
    expect(out.okf_bundle).toBe(true);
    expect(out.catalog).toBe(true);
    expect(cfg.build.blog?.archives).toBe(true);
    expect(cfg.build.diagrams?.enabled).toBe(true);
  });

  test("preset blog は軽量既定", () => {
    const cfg = mergeConfig({ preset: "blog" });
    const out = resolveBuildOutputs(cfg.build.outputs);
    expect(out.okf_bundle).toBe(false);
    expect(cfg.build.blog?.archives).toBe(false);
    expect(cfg.build.diagrams?.enabled).toBe(false);
  });

  test("docs.index_layout を保持する", () => {
    const cfg = mergeConfig({
      docs: {
        index_layout: "landing",
        nav: ["getting-started.html"],
      },
    });
    expect(cfg.docs?.index_layout).toBe("landing");
    expect(cfg.docs?.nav).toEqual(["getting-started.html"]);
  });

  test("diagrams を deep merge する", () => {
    const cfg = mergeConfig({
      build: {
        content_dir: "content",
        out_dir: "dist",
        permalink: "{{slug}}.html",
        diagrams: {
          mermaid: { mode: "off" },
          d2: { enabled: true },
          graphviz: { enabled: true },
        },
      },
    });
    expect(cfg.build.diagrams?.enabled).toBe(false);
    expect(cfg.build.diagrams?.mermaid?.mode).toBe("off");
    expect(cfg.build.diagrams?.mermaid?.version).toBe("~11.15.0");
    expect(cfg.build.diagrams?.d2?.enabled).toBe(true);
    expect(cfg.build.diagrams?.d2?.binary).toBe("d2");
    expect(cfg.build.diagrams?.graphviz?.enabled).toBe(true);
    expect(cfg.build.diagrams?.graphviz?.binary).toBe("dot");
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