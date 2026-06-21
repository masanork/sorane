import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import {
  prepareHtmlForPdf,
  prepareHtmlForPdfAsync,
} from "../packages/core/src/export/pdf-html.ts";

describe("prepareHtmlForPdf", () => {
  test("print.css を追加し search / mermaid スクリプトを除去", () => {
    const html = `<!doctype html>
<html><head>
<link rel="stylesheet" href="./assets/main.css">
<script type="module" src="./assets/search.mjs"></script>
<script type="module" src="./assets/diagrams/sorane-mermaid-loader.mjs"></script>
</head><body><main>ok</main></body></html>`;
    const out = prepareHtmlForPdf(html);
    expect(out).toContain('href="./assets/print.css"');
    expect(out.includes("search.mjs")).toBe(false);
    expect(out.includes("sorane-mermaid-loader")).toBe(false);
    expect(out).toContain("main.css");
  });

  test("ネストパスの rootPrefix を維持", () => {
    const html =
      '<link rel="stylesheet" href="../assets/main.css">';
    const out = prepareHtmlForPdf(html);
    expect(out).toContain('href="../assets/print.css"');
  });
});

describe("prepareHtmlForPdfAsync diagram fallback", () => {
  test("client mermaid pre を fallback figure に差し替え", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-pdf-diag-"));
    try {
      const html =
        '<pre data-sorane-alt="Test diagram"><code class="language-mermaid">flowchart LR\n  A --> B</code></pre>';
      const out = await prepareHtmlForPdfAsync(html, {
        distDir: dir,
        prerenderDiagrams: true,
      });
      expect(out.includes("language-mermaid")).toBe(false);
      expect(
        out.includes("diagram--mermaid") || out.includes("diagram--fallback"),
      ).toBe(true);
      expect(out).toContain("Test diagram");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});