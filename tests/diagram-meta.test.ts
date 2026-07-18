import { describe, expect, test } from "./_expect.ts";
import {
  countDiagramsForConfig,
  diagramHeadForPage,
  emptyDiagramMeta,
  mergeDiagramMeta,
  resolveMermaidMode,
} from "../packages/core/src/diagrams/diagram-meta.ts";
import { buildMermaidHead } from "../packages/core/src/diagrams/mermaid-head.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";
import { DIAGRAMS_ON } from "./_diagrams-config.ts";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Root } from "mdast";

describe("mergeDiagramMeta", () => {
  test("カウントを合算する", () => {
    expect(
      mergeDiagramMeta(
        { mermaid: 2, d2: 1, graphviz: 1, plantuml: 0 },
        { mermaid: 1, d2: 3, graphviz: 2, plantuml: 0 },
      ),
    ).toEqual({ mermaid: 3, d2: 4, graphviz: 3, plantuml: 0 });
  });
});

describe("emptyDiagramMeta", () => {
  test("ゼロ初期化", () => {
    expect(emptyDiagramMeta()).toEqual({ mermaid: 0, d2: 0, graphviz: 0, plantuml: 0 });
  });
});

describe("countDiagramsForConfig", () => {
  test("mermaid / d2 を lang で数える", () => {
    const tree = unified()
      .use(remarkParse)
      .parse(
        "```mermaid\na\n```\n\n```mermaid\nb\n```\n\n```d2\nc\n```\n",
      ) as Root;
    const counts = countDiagramsForConfig(tree, {
      ...DIAGRAMS_ON,
      d2: { enabled: true },
    });
    expect(counts.mermaid).toBe(2);
    expect(counts.d2).toBe(1);
  });

  test("graphviz を数える", () => {
    const tree = unified()
      .use(remarkParse)
      .parse("```dot\na -> b\n```\n") as Root;
    const counts = countDiagramsForConfig(tree, {
      ...DIAGRAMS_ON,
      graphviz: { enabled: true },
    });
    expect(counts.graphviz).toBe(1);
  });

  test("enabled: false ではゼロ", () => {
    const tree = unified()
      .use(remarkParse)
      .parse("```mermaid\na\n```") as Root;
    expect(countDiagramsForConfig(tree, { enabled: false })).toEqual({
      mermaid: 0,
      d2: 0,
      graphviz: 0,
      plantuml: 0,
    });
  });

  test("plantuml を数える", () => {
    const tree = unified()
      .use(remarkParse)
      .parse("```plantuml\n@startuml\nA -> B\n@enduml\n```\n") as Root;
    const counts = countDiagramsForConfig(tree, {
      ...DIAGRAMS_ON,
      plantuml: { enabled: true },
    });
    expect(counts.plantuml).toBe(1);
  });
});

describe("resolveMermaidMode", () => {
  test("既定は client", () => {
    expect(resolveMermaidMode(DIAGRAMS_ON)).toBe("client");
  });

  test("build / off / disabled", () => {
    expect(
      resolveMermaidMode({ ...DIAGRAMS_ON, mermaid: { mode: "build" } }),
    ).toBe("build");
    expect(resolveMermaidMode({ ...DIAGRAMS_ON, mermaid: { mode: "off" } })).toBe("off");
    expect(resolveMermaidMode({ enabled: false })).toBe("off");
  });
});

describe("diagramHeadForPage", () => {
  test("mermaid ありで loader script", () => {
    const head = diagramHeadForPage(
      { mermaid: 1, d2: 0, graphviz: 0, plantuml: 0 },
      "./",
      DIAGRAMS_ON,
    );
    expect(head).toBe(buildMermaidHead("./"));
    expect(head).toContain("sorane-mermaid-loader.mjs");
  });

  test("mermaid 無しは undefined", () => {
    expect(diagramHeadForPage(emptyDiagramMeta(), "./", DEFAULT_DIAGRAMS_CONFIG)).toBe(
      undefined,
    );
  });

  test("mode: off では undefined", () => {
    expect(
      diagramHeadForPage(
        { mermaid: 1, d2: 0, graphviz: 0, plantuml: 0 },
        "./",
        { ...DIAGRAMS_ON, mermaid: { mode: "off" } },
      ),
    ).toBe(undefined);
  });

  test("mode: build では loader 無し", () => {
    expect(
      diagramHeadForPage(
        { mermaid: 1, d2: 0, graphviz: 0, plantuml: 0 },
        "./",
        { ...DIAGRAMS_ON, mermaid: { mode: "build" } },
      ),
    ).toBe(undefined);
  });
});