import { describe, expect, test } from "./_expect.ts";
import { renderMarkdownDocument } from "../packages/core/src/render.ts";
import { renderBodySection } from "../packages/core/src/diagrams/render-body-section.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

const MERMAID_MD = '```mermaid alt="Test diagram"\nflowchart LR\n  A --> B\n```\n';

describe("renderMarkdownDocument (diagrams)", () => {
  test("mermaid フェンスは data-sorane-alt 付き pre を出す", () => {
    const { html, diagrams } = renderMarkdownDocument(MERMAID_MD);
    expect(html).toContain('class="language-mermaid"');
    expect(html).toContain("data-sorane-alt");
    expect(html).toContain("Test diagram");
    expect(diagrams?.mermaid).toBe(1);
    expect(diagrams?.d2).toBe(0);
  });

  test("無効な mermaid でも PE HTML を出す", () => {
    const { html } = renderMarkdownDocument("```mermaid\nthis is not valid mermaid!!!\n```\n");
    expect(html).toContain('class="language-mermaid"');
    expect(html.includes("<script")).toBe(false);
  });

  test("diagrams.enabled: false では通常の code ブロック", () => {
    const { html, diagrams } = renderMarkdownDocument(MERMAID_MD, {
      diagrams: { enabled: false },
    });
    expect(html).toContain('class="language-mermaid"');
    expect(html.includes("data-sorane-alt")).toBe(false);
    expect(diagrams?.mermaid).toBe(0);
  });

  test("alt は %% alt コメントからも付与", () => {
    const md = "```mermaid\n%% alt: From comment\nflowchart LR\n  X --> Y\n```\n";
    const { html } = renderMarkdownDocument(md);
    expect(html).toContain("From comment");
  });
});

describe("renderBodySection", () => {
  test("renderMarkdownDocument のラッパー", () => {
    const section = renderBodySection(MERMAID_MD, { diagrams: DEFAULT_DIAGRAMS_CONFIG });
    expect(section.diagrams.mermaid).toBe(1);
    expect(section.html).toContain("language-mermaid");
    expect(section.outline.length).toBe(0);
  });
});