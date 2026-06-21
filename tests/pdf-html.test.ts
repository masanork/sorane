import { describe, expect, test } from "./_expect.ts";
import { prepareHtmlForPdf } from "../packages/core/src/export/pdf-html.ts";

describe("prepareHtmlForPdf", () => {
  test("print.css を追加し search スクリプトを除去", () => {
    const html = `<!doctype html>
<html><head>
<link rel="stylesheet" href="./assets/main.css">
<script type="module" src="./assets/search.mjs"></script>
</head><body><main>ok</main></body></html>`;
    const out = prepareHtmlForPdf(html);
    expect(out).toContain('href="./assets/print.css"');
    expect(out.includes("search.mjs")).toBe(false);
    expect(out).toContain("main.css");
  });

  test("ネストパスの rootPrefix を維持", () => {
    const html =
      '<link rel="stylesheet" href="../assets/main.css">';
    const out = prepareHtmlForPdf(html);
    expect(out).toContain('href="../assets/print.css"');
  });
});