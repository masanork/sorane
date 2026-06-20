import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";
import {
  compileGraphvizToSvg,
  isGraphvizCompileEnabled,
  isGraphvizLang,
} from "../packages/core/src/diagrams/compile-graphviz.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

function dotAvailable(): boolean {
  try {
    execFileSync("dot", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("isGraphvizLang", () => {
  test("graphviz と dot", () => {
    expect(isGraphvizLang("graphviz")).toBe(true);
    expect(isGraphvizLang("dot")).toBe(true);
    expect(isGraphvizLang("mermaid")).toBe(false);
  });
});

describe("isGraphvizCompileEnabled", () => {
  test("graphviz.enabled で true", () => {
    expect(
      isGraphvizCompileEnabled({
        ...DEFAULT_DIAGRAMS_CONFIG,
        graphviz: { enabled: true },
      }),
    ).toBe(true);
  });
});

describe("compileGraphvizToSvg", () => {
  test("不正バイナリは失敗", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-dot-"));
    try {
      const result = await compileGraphvizToSvg({
        source: 'digraph { a -> b }',
        binary: "/nonexistent/dot",
        outDir: tmp,
      });
      expect(result.ok).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("dot 利用可能時は SVG を生成", async () => {
    if (!dotAvailable()) return;
    const tmp = mkdtempSync(join(tmpdir(), "sorane-dot-"));
    try {
      const result = await compileGraphvizToSvg({
        source: "digraph G { a -> b }",
        binary: "dot",
        outDir: tmp,
      });
      expect(result.ok).toBe(true);
      expect(existsSync(join(tmp, result.svgFileName))).toBe(true);
      expect(readFileSync(join(tmp, result.svgFileName), "utf8").includes("<svg")).toBe(
        true,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});