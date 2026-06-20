import { describe, expect, test } from "./_expect.ts";
import { ogLocaleFromLang, resolveOgImageUrl } from "../packages/core/src/og-meta.ts";

describe("resolveOgImageUrl", () => {
  test("絶対 URL はそのまま", () => {
    expect(resolveOgImageUrl("", "https://cdn.example/og.png")).toBe(
      "https://cdn.example/og.png",
    );
  });

  test("ルート相対パスを base_url と結合", () => {
    expect(resolveOgImageUrl("https://ex.dev", "/assets/og.png")).toBe(
      "https://ex.dev/assets/og.png",
    );
  });

  test("base_url 無しの相対パスは undefined", () => {
    expect(resolveOgImageUrl("", "assets/og.png")).toBe(undefined);
  });
});

describe("ogLocaleFromLang", () => {
  test("ja / en を変換", () => {
    expect(ogLocaleFromLang("ja")).toBe("ja_JP");
    expect(ogLocaleFromLang("en")).toBe("en_US");
  });
});