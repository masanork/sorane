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

describe("diagram metadata", () => {
  test("merges counts and starts empty", () => {
    expect(mergeDiagramMeta({ mermaid: 2 }, { mermaid: 1 })).toEqual({ mermaid: 3 });
    expect(emptyDiagramMeta()).toEqual({ mermaid: 0 });
  });

  test("counts Mermaid fences only", () => {
    const tree = unified().use(remarkParse).parse(
      "```mermaid\na\n```\n\n```mermaid\nb\n```\n\n```d2\nc\n```\n",
    ) as Root;
    expect(countDiagramsForConfig(tree, DIAGRAMS_ON)).toEqual({ mermaid: 2 });
    expect(countDiagramsForConfig(tree, { enabled: false })).toEqual({ mermaid: 0 });
  });

  test("resolves client, build, and off modes", () => {
    expect(resolveMermaidMode(DIAGRAMS_ON)).toBe("client");
    expect(resolveMermaidMode({ ...DIAGRAMS_ON, mermaid: { mode: "build" } })).toBe("build");
    expect(resolveMermaidMode({ ...DIAGRAMS_ON, mermaid: { mode: "off" } })).toBe("off");
    expect(resolveMermaidMode({ enabled: false })).toBe("off");
  });

  test("adds loader only for client-rendered Mermaid", () => {
    expect(diagramHeadForPage({ mermaid: 1 }, "./", DIAGRAMS_ON)).toBe(buildMermaidHead("./"));
    expect(diagramHeadForPage(emptyDiagramMeta(), "./", DEFAULT_DIAGRAMS_CONFIG)).toBe(undefined);
    expect(
      diagramHeadForPage({ mermaid: 1 }, "./", { ...DIAGRAMS_ON, mermaid: { mode: "build" } }),
    ).toBe(undefined);
  });
});
