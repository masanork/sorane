import { describe, expect, test } from "./_expect.ts";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { parseTermLinkPlugin, type TermLinkNode } from "../packages/core/src/markup/parse-term-link.ts";
import type { Root, Paragraph, Text, Link } from "mdast";

function parse(markdown: string): Root {
  const processor = unified().use(remarkParse).use(parseTermLinkPlugin);
  const tree = processor.parse(markdown) as Root;
  return processor.runSync(tree) as Root;
}

function isTermLink(node: unknown): node is TermLinkNode {
  return typeof node === "object" && node !== null && (node as { type: string }).type === "termLink";
}

describe("parseTermLinkPlugin", () => {
  test("[[term:distribution]] を termLink にする", () => {
    const para = parse("[[term:distribution]]").children[0] as Paragraph;
    expect(isTermLink(para.children[0])).toBe(true);
    expect((para.children[0] as TermLinkNode).termId).toBe("distribution");
  });

  test("[[term:dcat|DCAT]] は label を保持", () => {
    const para = parse("[[term:dcat|DCAT]]").children[0] as Paragraph;
    const node = para.children[0] as TermLinkNode;
    expect(node.termId).toBe("dcat");
    expect(node.label).toBe("DCAT");
  });

  test("インラインコード内はリテラル", () => {
    const para = parse("`[[term:x]]`").children[0] as Paragraph;
    expect(para.children.filter(isTermLink).length).toBe(0);
  });
});

describe("resolveTermLinksPlugin", () => {
  test("インデックスで link に解決する", async () => {
    const { processMarkdownToMdast } = await import("../packages/core/src/markup/process-markdown.ts");
    const index = new Map([
      [
        "distribution",
        {
          termId: "distribution",
          href: "distribution.html",
          title: "Distribution",
          description: "A downloadable representation of a dataset.",
        },
      ],
    ]);
    const tree = processMarkdownToMdast("[[term:distribution]]", { glossaryIndex: index });
    const para = tree.children[0] as Paragraph;
    expect(para.children[0]?.type).toBe("link");
    const link = para.children[0] as Link;
    expect(link.url).toBe("distribution.html");
    expect((link.children[0] as Text).value).toBe("Distribution");
  });
});