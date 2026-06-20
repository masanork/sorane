import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { d2SourceHash } from "../packages/core/src/diagrams/compile-d2.ts";

function d2Available(): boolean {
  try {
    execFileSync("d2", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function writeFixture(root: string, body: string): void {
  mkdirSync(join(root, "content"), { recursive: true });
  writeFileSync(join(root, "content", "diagram.md"), body);
}

function d2BuildConfig(outDir: string): Partial<SoraneConfig> {
  return mergeConfig({
    build: {
      out_dir: outDir,
      diagrams: { d2: { enabled: true } },
    },
  } as Partial<SoraneConfig>);
}

const D2_ARTICLE = `---
type: article
title: D2 diagram
---

\`\`\`d2 alt="Topology"
x -> y: link
\`\`\`
`;

describe("runBuild (d2)", () => {
  test("d2 無しでもビルドは成功し PE フォールバック", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-d2-build-"));
    const outDir = join(root, "dist");
    try {
      writeFixture(root, D2_ARTICLE);
      await runBuild({
        cwd: root,
        config: d2BuildConfig(outDir),
        clean: true,
      });
      const html = readFileSync(join(outDir, "diagram.html"), "utf8");
      expect(html.includes("language-d2") || html.includes("diagram--d2")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("d2 利用可能時は img SVG を emit する", async () => {
    if (!d2Available()) return;
    const root = mkdtempSync(join(tmpdir(), "sorane-d2-build-"));
    const outDir = join(root, "dist");
    try {
      writeFixture(root, D2_ARTICLE);
      await runBuild({
        cwd: root,
        config: d2BuildConfig(outDir),
        clean: true,
      });
      const fenceSource = "x -> y: link";
      const expectedHash = d2SourceHash(fenceSource);
      const html = readFileSync(join(outDir, "diagram.html"), "utf8");
      expect(html).toContain(`assets/diagrams/d2/${expectedHash}.svg`);
      expect(html).toContain('class="diagram diagram--d2"');
      expect(existsSync(join(outDir, "assets", "diagrams", "d2", `${expectedHash}.svg`))).toBe(
        true,
      );
      expect(html.includes("language-d2")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});