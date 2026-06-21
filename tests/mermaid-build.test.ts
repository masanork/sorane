import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { mmdcCompileWorks } from "./_mmdc-probe.ts";
import {
  compileMermaidToSvg,
  isMermaidBuildEnabled,
  resolveMmdcBinary,
} from "../packages/core/src/diagrams/compile-mermaid.ts";
import { diagramSourceHash } from "../packages/core/src/diagrams/diagram-hash.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

describe("isMermaidBuildEnabled", () => {
  test("mode: build で true", () => {
    expect(
      isMermaidBuildEnabled({
        ...DEFAULT_DIAGRAMS_CONFIG,
        enabled: true,
        mermaid: { mode: "build" },
      }),
    ).toBe(true);
  });
});

describe("compileMermaidToSvg", () => {
  test("不正バイナリは失敗", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-mmdc-"));
    try {
      const result = await compileMermaidToSvg({
        source: "flowchart LR\n  A --> B",
        binary: "/nonexistent/mmdc",
        outDir: tmp,
      });
      expect(result.ok).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("mmdc 利用可能時は SVG を生成", async (t) => {
    if (!(await mmdcCompileWorks())) return t.skip("mmdc compile unavailable");
    const tmp = mkdtempSync(join(tmpdir(), "sorane-mmdc-"));
    try {
      const source = "flowchart LR\n  A --> B";
      const result = await compileMermaidToSvg({
        source,
        binary: resolveMmdcBinary(DEFAULT_DIAGRAMS_CONFIG),
        outDir: tmp,
      });
      expect(result.ok).toBe(true);
      expect(result.hash).toBe(diagramSourceHash(source));
      const svg = readFileSync(join(tmp, result.svgFileName), "utf8");
      expect(svg.includes("<svg")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});