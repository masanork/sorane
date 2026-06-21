import { describe, expect, test } from "./_expect.ts";
import {
  draftPageBannerHtml,
  isDraftFrontmatter,
  previewSiteBannerHtml,
} from "../packages/core/src/preview-banner.ts";
import {
  resolvePreviewFilePath,
  startPreviewServer,
} from "../packages/core/src/preview-server.ts";
import { parsePortFlag, previewBuildArgv } from "../packages/cli/src/preview.ts";

describe("isDraftFrontmatter", () => {
  test("draft: true のみ", () => {
    expect(isDraftFrontmatter({ draft: true })).toBe(true);
    expect(isDraftFrontmatter({ draft: false })).toBe(false);
  });
});

describe("preview banners", () => {
  test("日本語メッセージ", () => {
    expect(previewSiteBannerHtml("ja")).toContain("ローカルプレビュー");
    expect(draftPageBannerHtml("ja")).toContain("下書き");
  });
});

describe("resolvePreviewFilePath", () => {
  test("index と traversal 拒否", () => {
    const root = "/tmp/site/dist";
    expect(resolvePreviewFilePath(root, "/")).toMatch(/index\.html$/);
    expect(resolvePreviewFilePath(root, "/../etc/passwd")).toBe(null);
  });
});

describe("previewBuildArgv", () => {
  test("drafts と preview を付与", () => {
    expect(previewBuildArgv("/x", true)).toEqual([
      "--cwd",
      "/x",
      "--drafts",
      "--preview",
      "--clean",
    ]);
  });
});

describe("parsePortFlag", () => {
  test("--port を解釈", () => {
    expect(parsePortFlag(["--port", "9000"])).toBe(9000);
    expect(parsePortFlag([])).toBe(undefined);
  });
});

describe("startPreviewServer", () => {
  test("静的ファイルを返す", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "sorane-preview-"));
    writeFileSync(join(dir, "index.html"), "<p>ok</p>", "utf8");
    const server = startPreviewServer(dir, 0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("ok");
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });
});