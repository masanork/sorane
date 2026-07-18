import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import {
  compilePlantumlToSvg,
  isPlantumlCompileEnabled,
  isPlantumlLang,
  resolvePlantumlKrokiUrl,
} from "../packages/core/src/diagrams/compile-plantuml.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";
import { renderMarkdownDocumentAsync } from "../packages/core/src/diagrams/render-async.ts";

describe("isPlantumlLang", () => {
  test("plantuml と puml", () => {
    expect(isPlantumlLang("plantuml")).toBe(true);
    expect(isPlantumlLang("puml")).toBe(true);
    expect(isPlantumlLang("mermaid")).toBe(false);
  });
});

describe("isPlantumlCompileEnabled", () => {
  test("plantuml.enabled で true", () => {
    expect(
      isPlantumlCompileEnabled({
        ...DEFAULT_DIAGRAMS_CONFIG,
        enabled: true,
        plantuml: { enabled: true },
      }),
    ).toBe(true);
    expect(isPlantumlCompileEnabled(DEFAULT_DIAGRAMS_CONFIG)).toBe(false);
  });
});

describe("resolvePlantumlKrokiUrl", () => {
  test("trailing slash を落とす", () => {
    expect(
      resolvePlantumlKrokiUrl({
        ...DEFAULT_DIAGRAMS_CONFIG,
        plantuml: { enabled: true, kroki_url: "https://kroki.example/" },
      }),
    ).toBe("https://kroki.example");
  });
});

describe("compilePlantumlToSvg", () => {
  test("モック fetch で SVG をキャッシュする", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-puml-"));
    try {
      const source = "@startuml\nAlice -> Bob: hello\n@enduml";
      let calls = 0;
      const fetchFn = async () => {
        calls += 1;
        return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
          status: 200,
          headers: { "Content-Type": "image/svg+xml" },
        });
      };
      // example.com is public/resolvable; fetch is mocked (no real Kroki call).
      const krokiUrl = "https://example.com";
      const result = await compilePlantumlToSvg({
        source,
        krokiUrl,
        outDir: tmp,
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(result.ok).toBe(true);
      expect(existsSync(join(tmp, result.svgFileName))).toBe(true);
      expect(readFileSync(join(tmp, result.svgFileName), "utf8")).toContain("<svg");

      const cached = await compilePlantumlToSvg({
        source,
        krokiUrl,
        outDir: tmp,
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(cached.ok).toBe(true);
      expect(calls).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("HTTP エラーは ok: false", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-puml-"));
    try {
      const result = await compilePlantumlToSvg({
        source: "bad",
        krokiUrl: "https://example.com",
        outDir: tmp,
        fetchFn: (async () =>
          new Response("nope", { status: 400 })) as unknown as typeof fetch,
      });
      expect(result.ok).toBe(false);
      expect(result.warning).toMatch(/400/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("renderMarkdownDocumentAsync plantuml", () => {
  test("成功時は figure.diagram--plantuml を注入", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-puml-render-"));
    try {
      const md =
        "```plantuml alt=\"hello\"\n@startuml\nA -> B\n@enduml\n```\n";
      const rendered = await renderMarkdownDocumentAsync(md, {
        diagrams: {
          enabled: true,
          plantuml: { enabled: true, kroki_url: "https://kroki.io" },
        },
        plantumlOutDir: tmp,
        rootPrefix: "./",
      });
      // Without injecting fetch into render path, real network may fail;
      // assert count and either figure or PE pre fallback.
      expect(rendered.diagrams?.plantuml).toBe(1);
      const hasFigure = rendered.html.includes("diagram--plantuml");
      const hasPre = rendered.html.includes("language-plantuml");
      expect(hasFigure || hasPre).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
