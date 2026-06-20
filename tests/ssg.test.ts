import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { extractDescription, buildPage } from "../packages/core/src/ssg.ts";
import { migrateToOkf } from "../packages/core/src/migrate.ts";

describe("extractDescription", () => {
  test("最初の散文段落を抽出", () => {
    const d = extractDescription("# Title\n\nFirst paragraph here.\n\nSecond.\n");
    expect(d).toBe("First paragraph here.");
  });
});

describe("buildPage", () => {
  test("alternate markdown link を出す", () => {
    const html = buildPage({
      title: "T",
      siteTitle: "Site",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      machineSources: [{ href: "t.md", type: "text/markdown" }],
    });
    expect(html).toContain('rel="alternate"');
    expect(html).toContain("text/markdown");
  });
});

describe("migrateToOkf", () => {
  test("srn 形式を OKF に変換", () => {
    const out = migrateToOkf(
      '---\ntitle: Old\ndate: "2025-06-01"\nlayout: article\n---\n\nBody\n',
      "2025-06-01-old.md",
    );
    expect(out).toContain("type: article");
    expect(out).toContain("timestamp: 2025-06-01T00:00:00Z");
    expect(out).toContain("profile: sorane-okf/0.1");
  });
});

describe("runBuild", () => {
  test("minimal example を dist に焼く", async () => {
    const exampleRoot = join(import.meta.dirname, "../examples/minimal");
    const tmp = mkdtempSync(join(tmpdir(), "sorane-build-"));
    try {
      const result = await runBuild({
        cwd: exampleRoot,
        config: {
          site: {
            title: "Sorane Example",
            description: "desc",
            base_url: "https://example.pages.dev",
            lang: "ja",
          },
          build: {
            content_dir: "content",
            out_dir: join(tmp, "dist"),
            permalink: "{{slug}}.html",
          },
        },
        clean: true,
      });
      expect(result.pages).toBe(2);
      expect(existsSync(join(tmp, "dist/index.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/2025-01-01-hello.html"))).toBe(true);
      expect(existsSync(join(tmp, "dist/2025-01-01-hello.md"))).toBe(true);
      expect(existsSync(join(tmp, "dist/okf/bundle.tar.gz"))).toBe(true);
      const html = readFileSync(join(tmp, "dist/2025-01-01-hello.html"), "utf8");
      expect(html).toContain("Hello OKF");
      expect(html).toContain('type="text/markdown"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});