import { describe, expect, test } from "./_expect.ts";
import {
  migrateToOkf,
  parseBumpProfileArg,
} from "../packages/core/src/migrate.ts";

describe("migrate --bump-profile", () => {
  test("0.2 に上げる", () => {
    const source = `---
type: article
title: T
profile: sorane-okf/0.1
---

Body
`;
    const out = migrateToOkf(source, "post.md", { bumpProfile: "0.2" });
    expect(out).toContain("profile: sorane-okf/0.2");
    expect(out).not.toContain("digitalSourceType");
  });

  test("0.3 に上げる", () => {
    const source = `---
type: article
title: T
profile: sorane-okf/0.2
---

Body
`;
    const out = migrateToOkf(source, "post.md", { bumpProfile: "0.3" });
    expect(out).toContain("profile: sorane-okf/0.3");
  });

  test("parseBumpProfileArg", () => {
    expect(parseBumpProfileArg(["--bump-profile", "0.2"])).toBe("0.2");
    expect(parseBumpProfileArg(["--bump-profile", "0.3"])).toBe("0.3");
  });

  test("未知バージョンはエラー", () => {
    let err: unknown;
    try {
      parseBumpProfileArg(["--bump-profile", "9.9"]);
    } catch (e) {
      err = e;
    }
    expect(err instanceof Error).toBe(true);
    expect((err as Error).message).toMatch(/unsupported/);
  });
});