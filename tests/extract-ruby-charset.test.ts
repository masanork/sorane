import { describe, expect, test } from "./_expect.ts";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { parseRubyPlugin } from "../packages/core/src/ruby/parse-ruby.ts";
import { extractRubyCharset } from "../packages/core/src/ruby/extract-ruby-charset.ts";
import type { Root } from "mdast";

function parse(markdown: string): Root {
  const processor = unified().use(remarkParse).use(parseRubyPlugin);
  const tree = processor.parse(markdown) as Root;
  return processor.runSync(tree) as Root;
}

describe("extractRubyCharset", () => {
  test("ルビなし → 空 Sets", () => {
    const out = extractRubyCharset(parse("普通の本文です。"));
    expect(out.base.size).toBe(0);
    expect(out.ruby.size).toBe(0);
  });

  test("単一ルビ 朝《あさ》", () => {
    const out = extractRubyCharset(parse("朝《あさ》"));
    expect([...out.base].sort()).toEqual([0x671d]);
    expect([...out.ruby].sort()).toEqual([0x3042, 0x3055]);
  });

  test("IVS を含むベース", () => {
    const out = extractRubyCharset(parse("辻\u{E0100}《つじ》"));
    expect(out.base.has(0x8fbb)).toBe(true);
    expect(out.base.has(0xe0100)).toBe(true);
  });
});