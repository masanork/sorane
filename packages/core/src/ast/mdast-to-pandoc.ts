// mdast → Pandoc JSON 1.23 互換 AST へ変換する純粋関数。
// design/markup-interchange.md。
//
// 入口は `processMarkdownToMdast` 適用済みの `Root` を受ける想定。
// 副作用なし、入力 mdast を mutate しない。

import type {
  Root,
  RootContent,
  Paragraph,
  Heading,
  Code,
  Image,
  Link,
  List,
  ListItem,
  Blockquote,
  ThematicBreak,
  Html,
  Text,
  Emphasis,
  Strong,
  Delete,
  InlineCode,
  PhrasingContent,
  Table as MdastTable,
  TableRow as MdastTableRow,
  TableCell as MdastTableCell,
} from 'mdast';
import * as P from './pandoc-types.ts';

const NULL_ATTR: P.Attr = ['', [], []];

const DIAGRAM_LANGS = new Set(['mermaid', 'd2', 'graphviz', 'dot']);

export function mdastToPandoc(tree: Root): P.Doc {
  return {
    'pandoc-api-version': P.PANDOC_API_VERSION,
    meta: {},
    blocks: convertBlocks(tree.children),
  };
}

function convertBlocks(nodes: readonly RootContent[]): readonly P.Block[] {
  const out: P.Block[] = [];
  for (const node of nodes) {
    const block = convertBlock(node);
    if (block !== null) {
      if (Array.isArray(block)) out.push(...block);
      else out.push(block as P.Block);
    }
  }
  return out;
}

function convertBlock(node: RootContent): P.Block | readonly P.Block[] | null {
  switch (node.type) {
    case 'paragraph':
      return convertParagraph(node);
    case 'heading':
      return convertHeading(node);
    case 'code':
      return convertCodeBlock(node);
    case 'list':
      return convertList(node);
    case 'blockquote':
      return convertBlockquote(node);
    case 'thematicBreak':
      return convertThematicBreak();
    case 'html':
      return convertHtmlBlock(node);
    case 'table':
      return convertTable(node as MdastTable);
    default:
      return null;
  }
}

function convertParagraph(node: Paragraph): P.Block {
  return { t: 'Para', c: convertInlines(node.children) };
}

function convertHeading(node: Heading): P.Block {
  return { t: 'Header', c: [node.depth, NULL_ATTR, convertInlines(node.children)] };
}

function convertCodeBlock(node: Code): P.Block {
  const lang = typeof node.lang === 'string' && node.lang.length > 0 ? node.lang : null;
  const classes: readonly string[] = lang === null ? [] : [lang];
  const hProps = (node.data as { hProperties?: { dataSoraneAlt?: string } } | undefined)?.hProperties;
  const altText = hProps?.dataSoraneAlt;
  const kvs: readonly (readonly [string, string])[] =
    typeof altText === 'string' && altText.length > 0 && lang !== null && DIAGRAM_LANGS.has(lang)
      ? [['data-sorane-alt', altText]]
      : [];
  return { t: 'CodeBlock', c: [['', classes, kvs], node.value] };
}

function convertHtmlBlock(node: Html): P.Block {
  return { t: 'RawBlock', c: ['html', node.value] };
}

function convertThematicBreak(): P.Block {
  return { t: 'HorizontalRule' };
}

function convertBlockquote(node: Blockquote): P.Block {
  return { t: 'BlockQuote', c: convertBlocks(node.children) };
}

function convertList(node: List): P.Block {
  const items: (readonly P.Block[])[] = [];
  for (const item of node.children) {
    items.push(convertListItem(item, node.spread === true || item.spread === true));
  }
  if (node.ordered === true) {
    const start = typeof node.start === 'number' ? node.start : 1;
    const attrs: P.ListAttributes = [start, 'Decimal', 'Period'];
    return { t: 'OrderedList', c: [attrs, items] };
  }
  return { t: 'BulletList', c: items };
}

function convertListItem(node: ListItem, loose: boolean): readonly P.Block[] {
  const out: P.Block[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!;
    if (!loose && child.type === 'paragraph') {
      out.push({ t: 'Plain', c: convertInlines(child.children) });
      continue;
    }
    const block = convertBlock(child);
    if (block !== null) {
      if (Array.isArray(block)) out.push(...block);
      else out.push(block as P.Block);
    }
  }
  return out;
}

function convertTable(node: MdastTable): P.Block {
  const aligns: readonly P.Alignment[] = (node.align ?? []).map((a) => mdastAlignToPandoc(a));
  const colspecs: readonly P.ColSpec[] = aligns.map((a) => [a, 'ColWidthDefault'] as P.ColSpec);
  const rows: readonly MdastTableRow[] = node.children;
  const headerRow: MdastTableRow | undefined = rows[0];
  const bodyRows: readonly MdastTableRow[] = rows.slice(1);
  const headRows: readonly P.TableRow[] = headerRow !== undefined
    ? [convertTableRow(headerRow, true, aligns)]
    : [];
  const head: P.TableHead = [NULL_ATTR, headRows];
  const bodyTableRows: readonly P.TableRow[] = bodyRows.map((r) => convertTableRow(r, false, aligns));
  const body: P.TableBody = [NULL_ATTR, 0, [], bodyTableRows];
  const foot: P.TableFoot = [NULL_ATTR, []];
  const caption: P.Caption = [null, []];
  return { t: 'Table', c: [NULL_ATTR, caption, colspecs, head, [body], foot] };
}

function convertTableRow(
  row: MdastTableRow,
  isHeader: boolean,
  aligns: readonly P.Alignment[],
): P.TableRow {
  void isHeader;
  const cells: readonly P.TableCell[] = row.children.map((cell, i) =>
    convertTableCell(cell, aligns[i] ?? 'AlignDefault'),
  );
  return [NULL_ATTR, cells];
}

function convertTableCell(cell: MdastTableCell, align: P.Alignment): P.TableCell {
  const inlines = convertInlines(cell.children as readonly PhrasingContent[]);
  const blocks: readonly P.Block[] = inlines.length === 0
    ? []
    : [{ t: 'Plain', c: inlines }];
  return [NULL_ATTR, align, 1, 1, blocks];
}

function mdastAlignToPandoc(a: 'left' | 'right' | 'center' | null | undefined): P.Alignment {
  switch (a) {
    case 'left':
      return 'AlignLeft';
    case 'right':
      return 'AlignRight';
    case 'center':
      return 'AlignCenter';
    default:
      return 'AlignDefault';
  }
}

function convertInlines(nodes: readonly PhrasingContent[]): readonly P.Inline[] {
  const out: P.Inline[] = [];
  for (const node of nodes) {
    const inline = convertInline(node);
    if (inline !== null) {
      if (Array.isArray(inline)) out.push(...inline);
      else out.push(inline as P.Inline);
    }
  }
  return out;
}

function convertInline(node: PhrasingContent): P.Inline | readonly P.Inline[] | null {
  switch (node.type) {
    case 'text':
      return splitTextToInlines((node as Text).value);
    case 'emphasis':
      return { t: 'Emph', c: convertInlines((node as Emphasis).children) };
    case 'strong':
      return { t: 'Strong', c: convertInlines((node as Strong).children) };
    case 'delete':
      return { t: 'Strikeout', c: convertInlines((node as Delete).children) };
    case 'inlineCode':
      return { t: 'Code', c: [NULL_ATTR, (node as InlineCode).value] };
    case 'break':
      return { t: 'LineBreak' } as P.Inline;
    case 'link': {
      const link = node as Link;
      const title = typeof link.title === 'string' ? link.title : '';
      return {
        t: 'Link',
        c: [NULL_ATTR, convertInlines(link.children as readonly PhrasingContent[]), [link.url, title]],
      };
    }
    case 'image': {
      const img = node as Image;
      const title = typeof img.title === 'string' ? img.title : '';
      const altInlines: readonly P.Inline[] = typeof img.alt === 'string' && img.alt.length > 0
        ? [{ t: 'Str', c: img.alt }]
        : [];
      return { t: 'Image', c: [NULL_ATTR, altInlines, [img.url, title]] };
    }
    case 'html':
      return { t: 'RawInline', c: ['html', (node as Html).value] };
    case 'ruby' as PhrasingContent['type']: {
      const r = node as unknown as { base: string; text: string };
      const attr: P.Attr = ['', [], [['data-sorane-rt', r.text]]];
      return { t: 'Span', c: [attr, [{ t: 'Str', c: r.base }]] };
    }
    default:
      return null;
  }
}

/**
 * mdast の `text` ノードをスペース区切りで `Str` / `Space` に分解する。
 * 空白以外の文字 (改行 \n、タブ \t など) は Str に保持して既存出力と byte 一致させる。
 */
function splitTextToInlines(value: string): readonly P.Inline[] {
  if (value.length === 0) return [];
  const out: P.Inline[] = [];
  let buf = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === ' ') {
      if (buf.length > 0) {
        out.push({ t: 'Str', c: buf });
        buf = '';
      }
      out.push({ t: 'Space' });
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) out.push({ t: 'Str', c: buf });
  return out;
}