import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";

function writeSite(
  dir: string,
  extra: string,
): void {
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
`,
    "utf8",
  );
  writeFileSync(join(dir, "content", "index.md"), "---\ntype: index\ntitle: Home\n---\n\nHi.\n", "utf8");
  writeFileSync(join(dir, "content", "draft-post.md"), extra, "utf8");
}

describe("build draft pages", () => {
  test("本番ビルドでは draft を除外", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-draft-"));
    try {
      writeSite(
        dir,
        "---\ntype: article\ntitle: Secret\ndraft: true\nprofile: sorane-okf/0.1\n---\n\nDraft.\n",
      );
      await runBuild({ cwd: dir, config: {} });
      expect(existsSync(join(dir, "dist", "draft-post.html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("includeDrafts で draft を出力", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-draft-"));
    try {
      writeSite(
        dir,
        "---\ntype: article\ntitle: Secret\ndraft: true\nprofile: sorane-okf/0.1\n---\n\nDraft.\n",
      );
      await runBuild({ cwd: dir, config: {}, includeDrafts: true, preview: true });
      const html = readFileSync(join(dir, "dist", "draft-post.html"), "utf8");
      expect(html).toContain("下書き");
      expect(html).toContain("ローカルプレビュー");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});