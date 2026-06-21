// T009: 自前 remark plugin 本実装 (research §1、contracts/ruby-parser.md)。
//
// 青空文庫風 `《》` (FR-001) と Markdown 風 `{|}` (FR-002) の両ルビ記法を、
// mdast Tree 上の text ノードを走査して RubyAnnotation ノードに置換する。
//
// - 明示境界 `｜` (U+FF5C) サポート (clarify Q1)
// - 漢字連続規則は ruby-base-charset.ts の isBaseChar に委譲 (Han script + IVS、clarify Q2)
// - モノルビ非対応 (FR-001a): `《あ|さ》` の `|` は区切らずリテラル扱い
// - code / inlineCode 配下は visitor が再帰しない (FR-004 / P6)
// - エスケープ `\《` 等は remark-parse の標準 escape 処理に委ねる (P7)
//
// 副作用なし、決定論的 (visitor 走査順は mdast 標準で安定)。

import type { Plugin } from 'unified';
import type { Root, Text, RootContent, Paragraph, ListItem, Heading, Blockquote } from 'mdast';
import { visit, SKIP } from 'unist-util-visit';
import { isBaseChar } from './ruby-base-charset.ts';

/**
 * RubyAnnotation: bunsen 独自 mdast 拡張ノード。
 * type discriminator は `'ruby'`、leaf node (子要素を持たない)。
 */
export interface RubyAnnotationNode {
  readonly type: 'ruby';
  readonly base: string;
  readonly text: string;
  readonly source: 'aozora' | 'markdown';
  readonly position?: import('unist').Position;
}

/** mdast の Parent.children に入りうる型を 004 で拡張するための union。 */
type RubyParent = Paragraph | ListItem | Heading | Blockquote;

/** mdast 標準型に RubyAnnotation を登録する宣言 (TS 用)。 */
declare module 'mdast' {
  interface PhrasingContentMap {
    ruby: RubyAnnotationNode;
  }
  interface RootContentMap {
    ruby: RubyAnnotationNode;
  }
}

/** 開始境界 `｜` (U+FF5C)。Markdown 風 `{|}` の `|` (U+007C) とは別文字。 */
const AOZORA_BOUNDARY = '｜';

/**
 * remark plugin 本体。mdast Tree を mutate する (visitor の標準パターン)。
 *
 * code / inlineCode の text 互換ノードはここに来ないので、parent 種別判定は不要。
 */
export const parseRubyPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      const replacements = parseTextNode(node as Text);
      if (replacements === null) return;
      const childrenAny = (parent as RubyParent).children as unknown as RootContent[];
      childrenAny.splice(index, 1, ...(replacements as unknown as RootContent[]));
      return [SKIP, index + replacements.length];
    });
  };
};

/**
 * 1 つの text ノードからルビ記法を全件抽出し、新しい子ノードシーケンスを返す。
 * ルビ記法を 1 つも含まない場合は `null` (= 親への変更なし)。
 *
 * 戻り値の各要素は `Text` か `RubyAnnotationNode`。空 text ノードは返さない。
 */
function parseTextNode(node: Text): Array<Text | RubyAnnotationNode> | null {
  const value = node.value;
  if (!containsRubyMarkers(value)) return null;

  const out: Array<Text | RubyAnnotationNode> = [];
  let cursor = 0;

  while (cursor < value.length) {
    const found = findNextRuby(value, cursor);
    if (found === null) {
      if (cursor < value.length) {
        out.push({ type: 'text', value: value.slice(cursor) });
      }
      break;
    }
    if (found.preEnd > cursor) {
      out.push({ type: 'text', value: value.slice(cursor, found.preEnd) });
    }
    out.push({
      type: 'ruby',
      base: found.base,
      text: found.text,
      source: found.source,
      position: node.position,
    } as RubyAnnotationNode);
    cursor = found.end;
  }

  if (out.length === 1 && out[0]?.type === 'text' && out[0].value === value) {
    return null;
  }
  return out;
}

function containsRubyMarkers(value: string): boolean {
  return value.includes('《') || value.includes('{');
}

interface FoundRuby {
  preEnd: number;
  start: number;
  end: number;
  base: string;
  text: string;
  source: 'aozora' | 'markdown';
}

/**
 * `value` の `from` 以降から最も早く現れるルビ記法を探す。
 * 解釈に失敗した記法 (空ベース、空ふりがな、`《》` 直前が漢字でない等) は skip して次へ。
 */
function findNextRuby(value: string, from: number): FoundRuby | null {
  let pos = from;
  while (pos < value.length) {
    const aozoraIdx = value.indexOf('《', pos);
    const markdownIdx = value.indexOf('{', pos);
    let useAozora: boolean;
    let nextIdx: number;
    if (aozoraIdx === -1 && markdownIdx === -1) return null;
    if (aozoraIdx === -1) {
      useAozora = false;
      nextIdx = markdownIdx;
    } else if (markdownIdx === -1) {
      useAozora = true;
      nextIdx = aozoraIdx;
    } else if (aozoraIdx < markdownIdx) {
      useAozora = true;
      nextIdx = aozoraIdx;
    } else {
      useAozora = false;
      nextIdx = markdownIdx;
    }

    const tryFn = useAozora ? tryParseAozora : tryParseMarkdown;
    const result = tryFn(value, nextIdx);
    if (result !== null) return result;
    pos = nextIdx + 1;
  }
  return null;
}

/**
 * 青空文庫風 `《》` の解釈を試みる。`startIdx` は `《` の位置。
 *
 * - `《》` の前を遡って:
 *   (a) 直前文字が `｜` ならその直後から `《` の直前までをベース、`｜` を含めない範囲が前残り
 *   (b) そうでなければ isBaseChar で連続する漢字を遡ってベースにする
 * - `》` が見つからない、ベース 0 文字、ふりがな空、いずれも null
 */
function tryParseAozora(value: string, startIdx: number): FoundRuby | null {
  const closeIdx = value.indexOf('》', startIdx + 1);
  if (closeIdx === -1) return null;
  const text = value.slice(startIdx + 1, closeIdx);
  if (text.length === 0) return null;

  // (a) 明示境界 ｜: 直前が ｜
  //   - ｜base《rt》: ベースは ｜ 直後から 《 直前
  //   - base｜《rt》: ｜ と 《 の間が空なら ｜ 直前の漢字連続をベース (design: 夕｜《ゆう》)
  if (startIdx > 0 && value[startIdx - 1] === AOZORA_BOUNDARY) {
    const boundaryIdx = startIdx - 1;
    let base = value.slice(boundaryIdx + 1, startIdx);
    let preEnd = boundaryIdx;

    if (base.length === 0) {
      let pos = 0;
      const cpArr: Array<{ cp: number; offset: number }> = [];
      while (pos < boundaryIdx) {
        const cp = value.codePointAt(pos)!;
        const size = cp > 0xffff ? 2 : 1;
        cpArr.push({ cp, offset: pos });
        pos += size;
      }
      let baseStartIdxInCpArr = cpArr.length;
      for (let i = cpArr.length - 1; i >= 0; i--) {
        if (isBaseChar(cpArr[i]!.cp)) {
          baseStartIdxInCpArr = i;
        } else {
          break;
        }
      }
      if (baseStartIdxInCpArr === cpArr.length) return null;
      const baseStart = cpArr[baseStartIdxInCpArr]!.offset;
      base = value.slice(baseStart, boundaryIdx);
      preEnd = baseStart;
    }

    if (base.length === 0) return null;
    return {
      preEnd,
      start: preEnd,
      end: closeIdx + 1,
      base,
      text,
      source: 'aozora',
    };
  }

  // (b) 漢字連続を遡る (codePoint 単位、IVS を正しく扱う)
  const cpArr: Array<{ cp: number; offset: number; size: number }> = [];
  let scan = 0;
  while (scan < startIdx) {
    const cp = value.codePointAt(scan)!;
    const size = cp > 0xffff ? 2 : 1;
    cpArr.push({ cp, offset: scan, size });
    scan += size;
  }
  let baseStartIdxInCpArr = cpArr.length;
  for (let i = cpArr.length - 1; i >= 0; i--) {
    const item = cpArr[i]!;
    if (isBaseChar(item.cp)) {
      baseStartIdxInCpArr = i;
    } else {
      break;
    }
  }
  if (baseStartIdxInCpArr === cpArr.length) return null;
  const firstItem = cpArr[baseStartIdxInCpArr]!;
  const baseStart = firstItem.offset;
  let preEnd = baseStart;

  // ベース漢字連続の直前が ｜ なら、それも消費する (混在ケース: 「これは｜朝日新聞《...》」)
  // (a) 分岐は startIdx-1 が ｜ のときだけ発火するが、(b) で漢字連続が ｜ の直後から
  // 始まる場合は、｜ は不要な装飾として前残りから除く方が自然 (青空文庫慣習)。
  if (baseStart > 0 && value[baseStart - 1] === AOZORA_BOUNDARY) {
    preEnd = baseStart - 1;
  }

  const base = value.slice(baseStart, startIdx);

  return {
    preEnd,
    start: preEnd,
    end: closeIdx + 1,
    base,
    text,
    source: 'aozora',
  };
}

/**
 * Markdown 風 `{base|text}` の解釈を試みる。`startIdx` は `{` の位置。
 *
 * - `{` から先の最初の `|` をベース/ふりがなの境界とする。
 * - `|` の右側の最初の `}` で終端。
 * - ベース・ふりがな空ならルビ解釈失敗。
 */
function tryParseMarkdown(value: string, startIdx: number): FoundRuby | null {
  const closeIdx = value.indexOf('}', startIdx + 1);
  if (closeIdx === -1) return null;
  const inside = value.slice(startIdx + 1, closeIdx);
  const pipeIdx = inside.indexOf('|');
  if (pipeIdx === -1) return null;
  const base = inside.slice(0, pipeIdx);
  const text = inside.slice(pipeIdx + 1);
  if (base.length === 0 || text.length === 0) return null;

  return {
    preEnd: startIdx,
    start: startIdx,
    end: closeIdx + 1,
    base,
    text,
    source: 'markdown',
  };
}
