import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { renderMarkdownDocument } from "../packages/core/src/render.ts";
import { renderBodySection } from "../packages/core/src/diagrams/render-body-section.ts";
import { renderMarkdownDocumentAsync } from "../packages/core/src/diagrams/render-async.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

const DIAGRAMS_ON = { ...DEFAULT_DIAGRAMS_CONFIG, enabled: true };
const MERMAID_MD = '```mermaid alt="Test diagram"\nflowchart LR\n  A --> B\n```\n';

describe("Mermaid rendering", () => {
  test("annotates a client Mermaid fence with alternative text", () => {
    const { html, diagrams } = renderMarkdownDocument(MERMAID_MD, { diagrams: DIAGRAMS_ON });
    expect(html).toContain('class="language-mermaid"');
    expect(html).toContain('data-sorane-alt="Test diagram"');
    expect(diagrams?.mermaid).toBe(1);
  });

  test("disabled diagrams leave ordinary code fences", () => {
    const { html, diagrams } = renderMarkdownDocument(MERMAID_MD, { diagrams: { enabled: false } });
    expect(html).toContain('class="language-mermaid"');
    expect(html).not.toContain("data-sorane-alt");
    expect(diagrams?.mermaid).toBe(0);
  });

  test("body-section wrapper keeps Mermaid metadata", () => {
    const section = renderBodySection(MERMAID_MD, { diagrams: DIAGRAMS_ON });
    expect(section.diagrams.mermaid).toBe(1);
    expect(section.html).toContain("language-mermaid");
  });

  test("build failure warns and leaves a code fallback", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-mermaid-render-"));
    const warnings: string[] = [];
    try {
      const { html, diagrams } = await renderMarkdownDocumentAsync(MERMAID_MD, {
        diagrams: { ...DIAGRAMS_ON, mermaid: { mode: "build", mmdc: "/missing/mmdc" } },
        mermaidOutDir: join(tmp, "mermaid"),
        onDiagramWarning: (message) => warnings.push(message),
      });
      expect(diagrams?.mermaid).toBe(1);
      expect(warnings.some((message) => message.includes("mermaid build failed"))).toBe(true);
      expect(html).toContain("language-mermaid");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
