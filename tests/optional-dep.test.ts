import { describe, expect, test } from "./_expect.ts";
import {
  detectPackageManager,
  formatMissingOptionalMessage,
  importOptionalModule,
  installCommandFor,
  isOptionalModuleMissing,
  OptionalPackageMissingError,
  requireOptionalModule,
} from "../packages/core/src/optional-dep.ts";

describe("isOptionalModuleMissing", () => {
  test("ERR_MODULE_NOT_FOUND を検出する", () => {
    const err = new Error("Cannot find package '@scope/pkg'");
    (err as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
    expect(isOptionalModuleMissing(err)).toBe(true);
  });

  test("無関係なエラーは false", () => {
    expect(isOptionalModuleMissing(new Error("boom"))).toBe(false);
  });
});

describe("formatMissingOptionalMessage", () => {
  test("コマンド名付きメッセージ", () => {
    const msg = formatMissingOptionalMessage(
      {
        packageName: "@sorane/search",
        feature: "search indexing",
        command: "index",
      },
      "npm install @sorane/search",
    );
    expect(msg).toContain('The "index" command requires');
    expect(msg).toContain("npm install @sorane/search");
  });
});

describe("detectPackageManager", () => {
  test("package-lock があると npm", () => {
    const pm = detectPackageManager(import.meta.dirname + "/..");
    expect(pm.command).toBe("npm");
    expect(pm.installArgs("@sorane/search")).toEqual(["install", "@sorane/search"]);
  });
});

describe("installCommandFor", () => {
  test("npm install 形式", () => {
    expect(installCommandFor("mermaid", import.meta.dirname + "/..")).toContain("install mermaid");
  });
});

describe("importOptionalModule", () => {
  test("存在しないパッケージは undefined", async () => {
    const mod = await importOptionalModule("@sorane/__definitely_missing_pkg__");
    expect(mod).toBe(undefined);
  });
});

describe("requireOptionalModule", () => {
  test("未インストール時は OptionalPackageMissingError", async () => {
    let thrown: unknown;
    try {
      await requireOptionalModule({
        packageName: "@sorane/__definitely_missing_pkg__",
        feature: "test feature",
        command: "test",
        interactive: false,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown instanceof OptionalPackageMissingError).toBe(true);
  });
});