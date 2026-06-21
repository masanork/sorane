import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";
import { renderMarkdownDocument } from "../packages/core/src/render.ts";
import { renderBodySection } from "../packages/core/src/diagrams/render-body-section.ts";
import { renderMarkdownDocumentAsync } from "../packages/core/src/diagrams/render-async.ts";
import { rehypeDiagramPre } from "../packages/core/src/diagrams/rehype-diagram-pre.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import type { Element, Root as HastRoot } from "hast";

function d2Available(): boolean {
  try {
    execFileSync("d2", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

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

function diagramPreTree(codeClass: string, alt: string): HastRoot {
  const code: Element = {
    type: "element",
    tagName: "code",
    properties: { className: codeClass.split(" "), dataSoraneAlt: alt },
    children: [{ type: "text", value: "diagram" }],
  };
  return {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "pre",
        properties: {},
        children: [code],
      },
    ],
  };
}

describe("rehypeDiagramPre", () => {
  test("data-sorane-alt を pre へ移す", () => {
    const tree = diagramPreTree("language-mermaid", "Alt text");
    unified().use(rehypeDiagramPre).runSync(tree);
    const html = unified().use(rehypeStringify).stringify(tree);
    expect(html).toContain('data-sorane-alt="Alt text"');
    expect(html.includes('code data-sorane-alt')).toBe(false);
  });

  test("graphviz code も対象", () => {
    const tree = diagramPreTree("language-dot", "G");
    unified().use(rehypeDiagramPre).runSync(tree);
    const html = unified().use(rehypeStringify).stringify(tree);
    expect(html).toContain('data-sorane-alt="G"');
  });
});

describe("renderMarkdownDocumentAsync (build backends)", () => {
  test("見出し outline と id を付与", async () => {
    const md = "## Section\n\nBody.\n";
    const { html, outline } = await renderMarkdownDocumentAsync(md);
    expect(outline.length).toBe(1);
    expect(outline[0]!.text).toBe("Section");
    expect(html).toContain('id="');
    expect(html).toContain("heading-anchor");
  });

  test("mermaid build 失敗は警告して PE フォールバック", async () => {
    const md = '```mermaid\nflowchart LR\n  A --> B\n```\n';
    const tmp = mkdtempSync(join(tmpdir(), "sorane-mmd-render-"));
    const warnings: string[] = [];
    try {
      const { html, diagrams } = await renderMarkdownDocumentAsync(md, {
        diagrams: {
          ...DEFAULT_DIAGRAMS_CONFIG,
          mermaid: { mode: "build", mmdc: "/nonexistent/mmdc" },
        },
        mermaidOutDir: join(tmp, "mermaid"),
        onDiagramWarning: (m) => warnings.push(m),
      });
      expect(diagrams?.mermaid).toBe(1);
      expect(warnings.some((w) => w.includes("mermaid build failed"))).toBe(true);
      expect(html).toContain("language-mermaid");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("graphviz build 失敗は警告", async () => {
    const md = '```dot\na -> b\n```\n';
    const tmp = mkdtempSync(join(tmpdir(), "sorane-gv-render-"));
    const warnings: string[] = [];
    try {
      const { diagrams } = await renderMarkdownDocumentAsync(md, {
        diagrams: {
          ...DEFAULT_DIAGRAMS_CONFIG,
          graphviz: { enabled: true, binary: "/nonexistent/dot" },
        },
        graphvizOutDir: join(tmp, "graphviz"),
        onDiagramWarning: (m) => warnings.push(m),
      });
      expect(diagrams?.graphviz).toBe(1);
      expect(warnings.some((w) => w.includes("graphviz compile failed"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("renderMarkdownDocument (d2)", () => {
  test("d2 無効時は language-d2 の pre を出す", () => {
    const md = '```d2 alt="Topo"\nx -> y\n```\n';
    const { html, diagrams } = renderMarkdownDocument(md);
    expect(html).toContain("language-d2");
    expect(diagrams?.d2).toBe(0);
  });

  test("d2 有効 + バイナリ無しは PE フォールバック", async () => {
    const md = '```d2 alt="Topo"\nx -> y\n```\n';
    const tmp = mkdtempSync(join(tmpdir(), "sorane-d2-render-"));
    try {
      const { html, diagrams } = await renderMarkdownDocumentAsync(md, {
        diagrams: {
          ...DEFAULT_DIAGRAMS_CONFIG,
          d2: { enabled: true, binary: "/nonexistent/d2-binary" },
        },
        d2OutDir: join(tmp, "d2"),
        rootPrefix: "./",
        onDiagramWarning: () => {},
      });
      expect(diagrams?.d2).toBe(1);
      expect(html).toContain("language-d2");
      expect(html.includes("diagram--d2")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("d2 有効 + d2 利用可能時は figure img を出す", async () => {
    if (!d2Available()) return;
    const md = '```d2 alt="Topo"\na -> b\n```\n';
    const tmp = mkdtempSync(join(tmpdir(), "sorane-d2-render-"));
    try {
      const { html, diagrams } = await renderMarkdownDocumentAsync(md, {
        diagrams: { ...DEFAULT_DIAGRAMS_CONFIG, d2: { enabled: true } },
        d2OutDir: join(tmp, "d2"),
        rootPrefix: "../",
      });
      expect(diagrams?.d2).toBe(1);
      expect(html).toContain('class="diagram diagram--d2"');
      expect(html).toContain("../assets/diagrams/d2/");
      expect(html).toContain('loading="lazy"');
      expect(html.includes("language-d2")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});