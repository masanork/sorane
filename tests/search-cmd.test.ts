import { describe, expect, test } from "./_expect.ts";
import { parseSearchQuery } from "../packages/cli/src/search-cmd.ts";

describe("parseSearchQuery", () => {
  test("--type の値を query と誤認しない", () => {
    expect(parseSearchQuery(["--type", "article", "hello world"])).toBe("hello world");
  });

  test("先頭の query", () => {
    expect(parseSearchQuery(["find me", "--json", "--cwd", "/tmp"])).toBe("find me");
  });

  test("フラグのみは空", () => {
    expect(parseSearchQuery(["--json", "--fts-only"])).toBe("");
  });
});