import { describe, expect, test } from "./_expect.ts";
import { unified } from "unified";
import remarkParse from "remark-parse";
import {
  parseRubyPlugin,
  type RubyAnnotationNode,
} from "../packages/core/src/ruby/parse-ruby.ts";
import type { Root, Paragraph, Text, Code, InlineCode } from "mdast";

function parse(markdown: string): Root {
  const processor = unified().use(remarkParse).use(parseRubyPlugin);
  const tree = processor.parse(markdown) as Root;
  return processor.runSync(tree) as Root;
}

function paragraphChildren(tree: Root): Array<Text | RubyAnnotationNode | Code | InlineCode> {
  const para = tree.children[0] as Paragraph | undefined;
  if (para === undefined) return [];
  return para.children as Array<Text | RubyAnnotationNode | Code | InlineCode>;
}

function isRuby(node: unknown): node is RubyAnnotationNode {
  return typeof node === "object" && node !== null && (node as { type: string }).type === "ruby";
}

describe("parseRubyPlugin — 基本ルビ記法", () => {
  test("青空文庫風 朝《あさ》", () => {
    const children = paragraphChildren(parse("朝《あさ》"));
    expect(children.length).toBe(1);
    expect(isRuby(children[0])).toBe(true);
    if (isRuby(children[0])) {
      expect(children[0].base).toBe("朝");
      expect(children[0].text).toBe("あさ");
      expect(children[0].source).toBe("aozora");
    }
  });

  test("Markdown 風 {朝|あさ}", () => {
    const children = paragraphChildren(parse("{朝|あさ}"));
    expect(isRuby(children[0])).toBe(true);
    if (isRuby(children[0])) {
      expect(children[0].source).toBe("markdown");
    }
  });

  test("明示境界 ｜base《rt》", () => {
    const tree = parse("これは｜朝日新聞《あさひしんぶん》ですよ");
    const rubyNodes = paragraphChildren(tree).filter(isRuby);
    expect(rubyNodes[0]?.base).toBe("朝日新聞");
    expect((paragraphChildren(tree)[0] as Text).value).toBe("これは");
  });

  test("明示境界 base｜《rt》 (夕｜《ゆう》)", () => {
    const rubyNodes = paragraphChildren(parse("夕｜《ゆう》")).filter(isRuby);
    expect(rubyNodes[0]?.base).toBe("夕");
    expect(rubyNodes[0]?.text).toBe("ゆう");
  });

  test("インラインコード内はリテラル", () => {
    const para = parse("`朝《あさ》` のように").children[0] as Paragraph;
    expect(para.children.filter(isRuby).length).toBe(0);
  });
});