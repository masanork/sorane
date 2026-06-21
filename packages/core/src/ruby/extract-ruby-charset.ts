// T011: ルビ AST から charset を抽出する純粋関数 (contracts/ruby-charset-port.md)。
//
// **FR-011 完全非破壊**: 002 の `extract-charset.ts` を import しない。型レベルでも参照
// しない。004 の関心 (RubyAnnotation の base/text 抽出) のみに閉じる。
//
// 副作用なし、決定論的、Tree を変更しない。

import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { RubyAnnotationNode } from './parse-ruby.ts';

export interface RubyCharsetContribution {
  readonly base: ReadonlySet<number>;
  readonly ruby: ReadonlySet<number>;
}

/**
 * mdast Tree (parseRubyPlugin 適用済み) を走査し、RubyAnnotation の base / text 文字列の
 * 全コードポイント集合を返す。
 *
 * - base: 各 `RubyAnnotation.base` を `for ... of` で iterate して codePoint 単位に分解
 * - ruby: 各 `RubyAnnotation.text` を同様に分解
 * - IVS Variation Selectors (U+E0100..U+E01EF) は base 文字列に含まれていれば自然に
 *   入る (`for ... of` が surrogate pair / 後続 VS を正しく codePoint 化する)
 * - paragraph / heading / list / blockquote 配下も再帰走査される (visit の標準動作)
 */
export function extractRubyCharset(tree: Root): RubyCharsetContribution {
  const baseSet = new Set<number>();
  const rubySet = new Set<number>();

  visit(tree, 'ruby', (node: RubyAnnotationNode) => {
    for (const ch of node.base) {
      baseSet.add(ch.codePointAt(0)!);
    }
    for (const ch of node.text) {
      rubySet.add(ch.codePointAt(0)!);
    }
  });

  return { base: baseSet, ruby: rubySet };
}
