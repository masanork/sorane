import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type MergeConfigInput } from "../packages/core/src/config.ts";

function writeFixture(root: string, files: Record<string, string>, yaml?: string): void {
  mkdirSync(join(root, "content"), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, "content", rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  writeFileSync(
    join(root, "sorane.yaml"),
    yaml ??
      `site:
  title: Diagram Test
  description: test
  base_url: https://ex.dev
  lang: ja
build:
  content_dir: content
  out_dir: dist
  permalink: "{{slug}}.html"
`,
  );
}

const MERMAID_ARTICLE = `---
type: article
title: With diagram
---

\`\`\`mermaid alt="Build test"
flowchart LR
  A --> B
\`\`\`
`;

const PLAIN_ARTICLE = `---
type: article
title: Plain
---

No diagrams here.
`;

describe("runBuild (diagrams)", () => {
  test("mermaid 記事は loader script と assets を出す", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-diag-build-"));
    const outDir = join(root, "dist");
    try {
      writeFixture(root, { "diagram.md": MERMAID_ARTICLE });
      await runBuild({
        cwd: root,
        config: mergeConfig({
          preset: "okf-site",
          build: { out_dir: outDir, diagrams: { enabled: true } },
        } as MergeConfigInput),
        clean: true,
      });
      const html = readFileSync(join(outDir, "diagram.html"), "utf8");
      expect(html).toContain("sorane-mermaid-loader.mjs");
      expect(html).toContain("language-mermaid");
      expect(
        existsSync(join(outDir, "assets", "diagrams", "sorane-mermaid-loader.mjs")),
      ).toBe(true);
      const md = readFileSync(join(outDir, "diagram.md"), "utf8");
      expect(md).toContain("```mermaid");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("diagram 無し記事は loader script を出さない", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-diag-build-"));
    const outDir = join(root, "dist");
    try {
      writeFixture(root, { "plain.md": PLAIN_ARTICLE });
      await runBuild({
        cwd: root,
        config: mergeConfig({ build: { out_dir: outDir } } as MergeConfigInput),
        clean: true,
      });
      const html = readFileSync(join(outDir, "plain.html"), "utf8");
      expect(html.includes("sorane-mermaid-loader.mjs")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("index intro の mermaid でも loader を出す", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-diag-build-"));
    const outDir = join(root, "dist");
    try {
      writeFixture(root, {
        "index.md": `---
type: index
title: Home
---

Intro with diagram.

\`\`\`mermaid alt="Index"
flowchart LR
  X --> Y
\`\`\`
`,
        "article/post.md": PLAIN_ARTICLE,
      });
      await runBuild({
        cwd: root,
        config: mergeConfig({
          build: {
            out_dir: outDir,
            blog: { featured_mode: "off" },
            diagrams: { enabled: true },
          },
        } as MergeConfigInput),
        clean: true,
      });
      const html = readFileSync(join(outDir, "index.html"), "utf8");
      expect(html).toContain("sorane-mermaid-loader.mjs");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("featured_mode: full で最新記事の mermaid も集約する", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-diag-build-"));
    const outDir = join(root, "dist");
    try {
      writeFixture(root, {
        "index.md": `---
type: index
title: Blog
---

Welcome.
`,
        "article/2025-01-01-latest.md": `---
type: article
title: Latest
timestamp: 2025-01-01T00:00:00Z
---

\`\`\`mermaid alt="Featured"
flowchart LR
  F --> G
\`\`\`
`,
      });
      await runBuild({
        cwd: root,
        config: mergeConfig({
          build: {
            out_dir: outDir,
            blog: { featured_mode: "full" },
            diagrams: { enabled: true },
          },
        } as MergeConfigInput),
        clean: true,
      });
      const html = readFileSync(join(outDir, "index.html"), "utf8");
      expect(html).toContain("sorane-mermaid-loader.mjs");
      expect(html).toContain("language-mermaid");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("llms.txt に diagrams セクションを出す", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-diag-build-"));
    const outDir = join(root, "dist");
    try {
      writeFixture(root, { "diagram.md": MERMAID_ARTICLE });
      await runBuild({
        cwd: root,
        config: mergeConfig({
          preset: "okf-site",
          build: { out_dir: outDir, diagrams: { enabled: true } },
        } as MergeConfigInput),
        clean: true,
      });
      const llms = readFileSync(join(outDir, "llms.txt"), "utf8");
      expect(llms).toContain("```mermaid");
      expect(llms).toContain("sorane-mermaid-loader.mjs");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});