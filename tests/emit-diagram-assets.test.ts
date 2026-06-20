import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import {
  contentHasMermaidFences,
  emitDiagramAssets,
  substituteMermaidVersion,
} from "../packages/core/src/diagrams/emit-diagram-assets.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

describe("substituteMermaidVersion", () => {
  test("{{ MERMAID_VERSION }} を置換する", () => {
    const out = substituteMermaidVersion(
      'import("./mermaid-{{ MERMAID_VERSION }}/x.mjs")',
      "11.15.0",
    );
    expect(out).toContain("mermaid-11.15.0");
    expect(out.includes("MERMAID_VERSION")).toBe(false);
  });
});

describe("contentHasMermaidFences", () => {
  test("mermaid フェンスを検出する", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-mmd-"));
    try {
      const f = join(tmp, "a.md");
      writeFileSync(f, "# T\n\n```mermaid\nflowchart LR\n```\n");
      expect(contentHasMermaidFences([f])).toBe(true);
      writeFileSync(f, "# T\n\n```js\nx\n```\n");
      expect(contentHasMermaidFences([f])).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("emitDiagramAssets", () => {
  test("有効時は loader と mermaid dist をコピーする", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-emit-diag-"));
    const outDir = join(tmp, "dist");
    try {
      const result = emitDiagramAssets({
        cwd: process.cwd(),
        outDir,
        config: DEFAULT_DIAGRAMS_CONFIG,
        contentHasMermaid: true,
      });
      expect(result.copied).toBe(true);
      expect(result.version).toBe("11.15.0");
      const loader = join(outDir, "assets", "diagrams", "sorane-mermaid-loader.mjs");
      expect(existsSync(loader)).toBe(true);
      const body = readFileSync(loader, "utf8");
      expect(body).toContain("import.meta.url");
      expect(body).toContain("mermaid-11.15.0");
      expect(existsSync(join(outDir, "assets", "diagrams", "mermaid-11.15.0"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("enabled: false ではスキップ", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-emit-diag-"));
    try {
      const result = emitDiagramAssets({
        cwd: process.cwd(),
        outDir: join(tmp, "dist"),
        config: { enabled: false },
        contentHasMermaid: true,
      });
      expect(result.copied).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("contentHasMermaid: false ではスキップ", () => {
    const result = emitDiagramAssets({
      cwd: process.cwd(),
      outDir: join(tmpdir(), "unused"),
      config: DEFAULT_DIAGRAMS_CONFIG,
      contentHasMermaid: false,
    });
    expect(result.copied).toBe(false);
  });

  test("mermaid.mode: off ではスキップ", () => {
    const result = emitDiagramAssets({
      cwd: process.cwd(),
      outDir: join(tmpdir(), "unused"),
      config: { ...DEFAULT_DIAGRAMS_CONFIG, mermaid: { mode: "off" } },
      contentHasMermaid: true,
    });
    expect(result.copied).toBe(false);
  });
});