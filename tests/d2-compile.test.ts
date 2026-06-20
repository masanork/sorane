import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";
import {
  compileD2ToSvg,
  d2SourceHash,
  isD2CompileEnabled,
  resolveD2Binary,
} from "../packages/core/src/diagrams/compile-d2.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

function d2Available(): boolean {
  try {
    execFileSync("d2", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("d2SourceHash", () => {
  test("同じソースは同じハッシュ", () => {
    const a = d2SourceHash("x -> y\n");
    const b = d2SourceHash("x -> y\n");
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });
});

describe("isD2CompileEnabled", () => {
  test("d2.enabled で true", () => {
    expect(isD2CompileEnabled({ ...DEFAULT_DIAGRAMS_CONFIG, d2: { enabled: true } })).toBe(
      true,
    );
  });

  test("既定は false", () => {
    expect(isD2CompileEnabled(DEFAULT_DIAGRAMS_CONFIG)).toBe(false);
  });
});

describe("resolveD2Binary", () => {
  test("既定は d2", () => {
    expect(resolveD2Binary(DEFAULT_DIAGRAMS_CONFIG)).toBe("d2");
  });
});

describe("compileD2ToSvg", () => {
  test("既存 SVG は再コンパイルしない", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-d2-cache-"));
    try {
      const source = "a -> b\n";
      const hash = d2SourceHash(source);
      writeFileSync(join(tmp, `${hash}.svg`), "<svg></svg>", "utf8");
      const result = await compileD2ToSvg({
        source,
        binary: "d2",
        outDir: tmp,
      });
      expect(result.ok).toBe(true);
      expect(readFileSync(join(tmp, `${hash}.svg`), "utf8")).toBe("<svg></svg>");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("不正バイナリは warning 付きで失敗", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-d2-fail-"));
    try {
      const result = await compileD2ToSvg({
        source: "x -> y\n",
        binary: "/nonexistent/d2-binary",
        outDir: tmp,
      });
      expect(result.ok).toBe(false);
      expect(result.warning !== undefined).toBe(true);
      expect(existsSync(join(tmp, `${result.hash}.svg`))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("d2 利用可能時は SVG を生成する", async () => {
    if (!d2Available()) return;
    const tmp = mkdtempSync(join(tmpdir(), "sorane-d2-live-"));
    try {
      const source = "hello -> world\n";
      const result = await compileD2ToSvg({
        source,
        binary: "d2",
        outDir: tmp,
      });
      expect(result.ok).toBe(true);
      const svg = readFileSync(join(tmp, result.svgFileName), "utf8");
      expect(svg.includes("<svg")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});