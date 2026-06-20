import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { diagramSourceHash } from "../packages/core/src/diagrams/diagram-hash.ts";
import { resolveMmdcBinary } from "../packages/core/src/diagrams/compile-mermaid.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

function mmdcAvailable(): boolean {
  try {
    execFileSync(resolveMmdcBinary(DEFAULT_DIAGRAMS_CONFIG), ["--version"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const ARTICLE = `---
type: article
title: Mermaid build
---

\`\`\`mermaid alt="Build mode"
flowchart LR
  A --> B
\`\`\`
`;

describe("runBuild (mermaid.mode: build)", () => {
  test("mmdc 利用可能時は img を emit し loader を出さない", async () => {
    if (!mmdcAvailable()) return;
    const root = mkdtempSync(join(tmpdir(), "sorane-mmdc-build-"));
    const outDir = join(root, "dist");
    try {
      mkdirSync(join(root, "content"), { recursive: true });
      writeFileSync(join(root, "content", "page.md"), ARTICLE);
      await runBuild({
        cwd: root,
        config: mergeConfig({
          build: {
            out_dir: outDir,
            diagrams: { mermaid: { mode: "build" } },
          },
        } as Partial<SoraneConfig>),
        clean: true,
      });
      const source = "flowchart LR\n  A --> B";
      const hash = diagramSourceHash(source);
      const html = readFileSync(join(outDir, "page.html"), "utf8");
      expect(html).toContain(`assets/diagrams/mermaid/${hash}.svg`);
      expect(html).toContain('class="diagram diagram--mermaid"');
      expect(html.includes("sorane-mermaid-loader.mjs")).toBe(false);
      expect(existsSync(join(outDir, "assets", "diagrams", "mermaid", `${hash}.svg`))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});