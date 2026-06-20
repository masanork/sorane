import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import { resolveThemeAssetDir } from "../packages/core/src/theme-assets.ts";

describe("resolveThemeAssetDir", () => {
  test("ai-labels ディレクトリを解決する", () => {
    const dir = resolveThemeAssetDir(process.cwd(), "ai-labels");
    expect(dir !== null).toBe(true);
    expect(existsSync(join(dir!, "basic.svg"))).toBe(true);
    expect(existsSync(join(dir!, "fully-generated.svg"))).toBe(true);
    expect(existsSync(join(dir!, "partially-modified.svg"))).toBe(true);
  });
});