import { describe, expect, test } from "./_expect.ts";
import {
  detectDiagramKind,
  extractAltText,
  parseAltComment,
  parseInfoString,
  remarkDiagramFences,
} from "../packages/core/src/diagrams/parse-diagram-fence.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Code, Root } from "mdast";

function parseMarkdown(md: string): Root {
  return unified().use(remarkParse).parse(md) as Root;
}

function firstCode(tree: Root): Code {
  for (const child of tree.children) {
    if (child.type === "code") return child;
  }
  throw new Error("no code node");
}

describe("parseInfoString", () => {
  test('alt="..." を抽出する', () => {
    expect(parseInfoString('alt="Flow chart"')).toEqual({ alt: "Flow chart" });
  });

  test("alt='...' を抽出する", () => {
    expect(parseInfoString("alt='Sequence'")).toEqual({ alt: "Sequence" });
  });

  test("alt 無しは空", () => {
    expect(parseInfoString("")).toEqual({});
    expect(parseInfoString(undefined)).toEqual({});
  });
});

describe("parseAltComment", () => {
  test("%% alt: コメントを読む", () => {
    const src = "%% alt: Build pipeline\nflowchart LR\n  A --> B";
    expect(parseAltComment(src)).toBe("Build pipeline");
  });

  test("空コメントは undefined", () => {
    expect(parseAltComment("flowchart LR\n  A --> B")).toBe(undefined);
  });
});

describe("extractAltText", () => {
  test("info string が %% alt より優先", () => {
    const src = "%% alt: Comment alt\nflowchart LR\n  A --> B";
    expect(extractAltText('alt="Info alt"', src)).toBe("Info alt");
  });

  test("info string 無しはコメント", () => {
    const src = "%% alt: Comment alt\nflowchart LR\n  A --> B";
    expect(extractAltText(undefined, src)).toBe("Comment alt");
  });
});

describe("detectDiagramKind", () => {
  test("flowchart / graph", () => {
    expect(detectDiagramKind("flowchart LR\n  A --> B")).toBe("flowchart");
    expect(detectDiagramKind("graph TD\n  A --> B")).toBe("flowchart");
  });

  test("sequenceDiagram", () => {
    expect(detectDiagramKind("sequenceDiagram\n  A->>B: hi")).toBe("sequenceDiagram");
  });

  test("unsupported", () => {
    expect(detectDiagramKind("not-a-diagram")).toBe("unsupported");
    expect(detectDiagramKind("")).toBe("unsupported");
  });
});

describe("remarkDiagramFences", () => {
  test("mermaid フェンスに soraneDiagram を付与する", () => {
    const tree = parseMarkdown('```mermaid alt="X"\nflowchart LR\n  A --> B\n```');
    unified().use(remarkDiagramFences(DEFAULT_DIAGRAMS_CONFIG)).runSync(tree);
    const code = firstCode(tree);
    const meta = (code.data as { soraneDiagram?: { altText?: string; kind?: string } })
      .soraneDiagram;
    expect(meta?.altText).toBe("X");
    expect(meta?.kind).toBe("flowchart");
  });

  test("mermaid.mode: off では注釈しない", () => {
    const tree = parseMarkdown("```mermaid\nflowchart LR\n  A --> B\n```");
    unified()
      .use(
        remarkDiagramFences({
          ...DEFAULT_DIAGRAMS_CONFIG,
          mermaid: { mode: "off" },
        }),
      )
      .runSync(tree);
    const code = firstCode(tree);
    expect((code.data as { soraneDiagram?: unknown } | undefined)?.soraneDiagram).toBe(
      undefined,
    );
  });

  test("d2 は enabled 時のみ注釈する", () => {
    const tree = parseMarkdown("```d2\nx -> y\n```");
    unified()
      .use(remarkDiagramFences({ ...DEFAULT_DIAGRAMS_CONFIG, d2: { enabled: true } }))
      .runSync(tree);
    const code = firstCode(tree);
    const meta = (code.data as { soraneDiagram?: { lang?: string } }).soraneDiagram;
    expect(meta?.lang).toBe("d2");
  });
});