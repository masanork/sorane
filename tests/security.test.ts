import { describe, expect, test } from "./_expect.ts";
import {
  isSafeUrl,
  isSafeEmbedSrc,
  validateRedirectTarget,
  validateLinkHref,
} from "../packages/core/src/safe-url.ts";
import { isBlockedIpAddress, isBlockedHostname } from "../packages/core/src/fetch-url-guard.ts";
import { buildSanitizeSchema } from "../packages/core/src/markup/sanitize-schema.ts";
import { mergeConfig } from "../packages/core/src/config.ts";
import { resolveSecurityConfig } from "../packages/core/src/config.ts";
import { buildFtsWebIndex } from "../packages/search/src/web-export.ts";
import { stripUnsafeHtmlEmbeds } from "../packages/core/src/import/strip-unsafe-html.ts";
import { emergencyBannerHtml } from "../packages/core/src/emergency-banner.ts";
import { buildSecurityHeadersFile } from "../packages/core/src/security-headers.ts";
import type { ChunkRow } from "../packages/search/src/store.ts";

describe("safe-url", () => {
  test("blocks protocol-relative and javascript URLs", () => {
    expect(isSafeUrl("//evil.example/phish")).toBe(false);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,evil")).toBe(false);
    expect(isSafeUrl("/local.html")).toBe(true);
    expect(isSafeUrl("https://sorane.dev/")).toBe(true);
  });

  test("validateRedirectTarget rejects unsafe targets", () => {
    expect(validateRedirectTarget("//evil.example")).toMatch(/protocol-relative/);
    expect(validateRedirectTarget("https://sorane.dev/x")).toBe(undefined);
    expect(
      validateRedirectTarget("https://evil.example/", {
        sameOriginBase: "https://sorane.dev/",
      }),
    ).toMatch(/must stay on/);
  });

  test("validateLinkHref", () => {
    expect(validateLinkHref("//x")).toMatch(/protocol-relative/);
    expect(validateLinkHref("../x")).toBe(undefined);
  });

  test("isSafeEmbedSrc allows https only", () => {
    expect(isSafeEmbedSrc("https://www.youtube.com/embed/x")).toBe(true);
    expect(isSafeEmbedSrc("http://example.com/x")).toBe(false);
    expect(isSafeEmbedSrc("javascript:alert(1)")).toBe(false);
  });
});

describe("fetch-url-guard", () => {
  test("blocks private addresses and localhost", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.5")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedHostname("localhost")).toBe(true);
  });
});

describe("sanitize schema", () => {
  test("strict schema excludes iframe", () => {
    const strict = buildSanitizeSchema({ strictHtml: true });
    expect(strict.tagNames).not.toContain("iframe");
  });

  test("legacy embed schema includes iframe with https filter path", () => {
    const legacy = buildSanitizeSchema({ strictHtml: false });
    expect(legacy.tagNames).toContain("iframe");
  });
});

describe("gov preset security", () => {
  test("enables strict defaults", () => {
    const config = mergeConfig({ preset: "gov" });
    const security = resolveSecurityConfig(config);
    expect(security.strict_html).toBe(true);
    expect(security.search_snippet_only).toBe(true);
    expect(security.redirect_same_origin).toBe(true);
    expect(security.allow_custom_binaries).toBe(false);
    expect(security.link_scheme_check).toBe("error");
    expect(config.build.diagrams?.mermaid?.mode).toBe("build");
  });
});

describe("search snippet-only export", () => {
  test("omits full text when snippetOnly", () => {
    const row: ChunkRow = {
      id: 1,
      source: "a.md",
      chunkIndex: 0,
      text: "secret full body",
      headingPath: "Title",
      headingSlug: "title",
      docType: "article",
      title: "Title",
      timestamp: "",
      tags: "",
    };
    const idx = buildFtsWebIndex([row], () => "a.html", { snippetOnly: true });
    expect(idx.chunks[0]!.snippet).toContain("secret");
    expect(idx.chunks[0]!.text).toBe(undefined);
  });
});

describe("import strict html", () => {
  test("strips iframe and script", () => {
    const out = stripUnsafeHtmlEmbeds(
      '<p>ok</p><iframe src="https://x"></iframe><script>alert(1)</script>',
    );
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("script");
    expect(out).toContain("ok");
  });
});

describe("emergency banner", () => {
  test("drops javascript href", () => {
    const html = emergencyBannerHtml(
      { message: "Alert", severity: "warning", href: "javascript:alert(1)", linkText: "More" },
      "ja",
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Alert");
  });
});

describe("security headers", () => {
  test("emits CSP and X-Frame-Options", () => {
    const file = buildSecurityHeadersFile({ csp_profile: "strict" }, { hybridSearch: false });
    expect(file).toContain("Content-Security-Policy:");
    expect(file).toContain("frame-ancestors 'none'");
    expect(file).toContain("X-Frame-Options: DENY");
  });
});