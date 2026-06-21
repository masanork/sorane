import { processMarkdownToMdast } from "../markup/process-markdown.ts";
import { extractRubyCharset } from "./extract-ruby-charset.ts";

/** ルビ base/rt のコードポイントをフォントサブセット用テキストにする。 */
export function rubyCharsetExtraFromBody(body: string): string {
  const tree = processMarkdownToMdast(body);
  const { base, ruby } = extractRubyCharset(tree);
  const sorted = [...new Set([...base, ...ruby])].sort((a, b) => a - b);
  return sorted.length === 0 ? "" : String.fromCodePoint(...sorted);
}