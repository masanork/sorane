/**
 * Pandoc JSON 1.23 schema 内部表現
 *
 * 023 Phase A: bunsen の内部 AST を Pandoc JSON 1.23 互換にすることで、
 * 将来の外部 Pandoc filter エコシステム接続 / Verifiable Credentials / C2PA 等の
 * 表現中立性を担保する。
 *
 * 全フィールド readonly (immutable AST、map で新 AST 構築)。
 */

export type ApiVersion = readonly [1, 23, 0, 1];
export const PANDOC_API_VERSION: ApiVersion = [1, 23, 0, 1] as const;

export type Attr = readonly [
  id: string,
  classes: readonly string[],
  kvPairs: readonly (readonly [string, string])[],
];

export const nullAttr: Attr = ['', [], []] as const;

export type ListNumberStyle =
  | 'DefaultStyle'
  | 'Example'
  | 'Decimal'
  | 'LowerRoman'
  | 'UpperRoman'
  | 'LowerAlpha'
  | 'UpperAlpha';
export type ListNumberDelim = 'DefaultDelim' | 'Period' | 'OneParen' | 'TwoParens';
export type ListAttributes = readonly [start: number, style: ListNumberStyle, delim: ListNumberDelim];

export type Alignment = 'AlignLeft' | 'AlignRight' | 'AlignCenter' | 'AlignDefault';
export type ColWidth = 'ColWidthDefault' | { readonly t: 'ColWidth'; readonly c: number };
export type ColSpec = readonly [Alignment, ColWidth];
export type RowHeadColumns = number;

export type MathType = 'DisplayMath' | 'InlineMath';
export type QuoteType = 'SingleQuote' | 'DoubleQuote';

export type Target = readonly [url: string, title: string];

export type Citation = {
  readonly citationId: string;
  readonly citationPrefix: readonly Inline[];
  readonly citationSuffix: readonly Inline[];
  readonly citationMode: 'AuthorInText' | 'SuppressAuthor' | 'NormalCitation';
  readonly citationNoteNum: number;
  readonly citationHash: number;
};

export type Inline =
  | { readonly t: 'Str'; readonly c: string }
  | { readonly t: 'Emph'; readonly c: readonly Inline[] }
  | { readonly t: 'Strong'; readonly c: readonly Inline[] }
  | { readonly t: 'Strikeout'; readonly c: readonly Inline[] }
  | { readonly t: 'Superscript'; readonly c: readonly Inline[] }
  | { readonly t: 'Subscript'; readonly c: readonly Inline[] }
  | { readonly t: 'SmallCaps'; readonly c: readonly Inline[] }
  | { readonly t: 'Quoted'; readonly c: readonly [QuoteType, readonly Inline[]] }
  | { readonly t: 'Cite'; readonly c: readonly [readonly Citation[], readonly Inline[]] }
  | { readonly t: 'Code'; readonly c: readonly [Attr, string] }
  | { readonly t: 'Space' }
  | { readonly t: 'SoftBreak' }
  | { readonly t: 'LineBreak' }
  | { readonly t: 'Math'; readonly c: readonly [MathType, string] }
  | { readonly t: 'RawInline'; readonly c: readonly [format: string, content: string] }
  | { readonly t: 'Link'; readonly c: readonly [Attr, readonly Inline[], Target] }
  | { readonly t: 'Image'; readonly c: readonly [Attr, readonly Inline[], Target] }
  | { readonly t: 'Note'; readonly c: readonly Block[] }
  | { readonly t: 'Span'; readonly c: readonly [Attr, readonly Inline[]] };

export type TableCell = readonly [
  Attr,
  Alignment,
  rowSpan: number,
  colSpan: number,
  readonly Block[],
];
export type TableRow = readonly [Attr, readonly TableCell[]];
export type TableHead = readonly [Attr, readonly TableRow[]];
export type TableBody = readonly [Attr, RowHeadColumns, readonly TableRow[], readonly TableRow[]];
export type TableFoot = readonly [Attr, readonly TableRow[]];

export type Caption = readonly [readonly Inline[] | null, readonly Block[]];

export type Block =
  | { readonly t: 'Plain'; readonly c: readonly Inline[] }
  | { readonly t: 'Para'; readonly c: readonly Inline[] }
  | { readonly t: 'LineBlock'; readonly c: readonly (readonly Inline[])[] }
  | { readonly t: 'CodeBlock'; readonly c: readonly [Attr, string] }
  | { readonly t: 'RawBlock'; readonly c: readonly [format: string, content: string] }
  | { readonly t: 'BlockQuote'; readonly c: readonly Block[] }
  | { readonly t: 'OrderedList'; readonly c: readonly [ListAttributes, readonly (readonly Block[])[]] }
  | { readonly t: 'BulletList'; readonly c: readonly (readonly Block[])[] }
  | { readonly t: 'DefinitionList'; readonly c: readonly (readonly [readonly Inline[], readonly (readonly Block[])[]])[] }
  | { readonly t: 'Header'; readonly c: readonly [level: number, Attr, readonly Inline[]] }
  | { readonly t: 'HorizontalRule' }
  | { readonly t: 'Table'; readonly c: readonly [Attr, Caption, readonly ColSpec[], TableHead, readonly TableBody[], TableFoot] }
  | { readonly t: 'Div'; readonly c: readonly [Attr, readonly Block[]] };

export type MetaValue =
  | { readonly t: 'MetaMap'; readonly c: { readonly [key: string]: MetaValue } }
  | { readonly t: 'MetaList'; readonly c: readonly MetaValue[] }
  | { readonly t: 'MetaBool'; readonly c: boolean }
  | { readonly t: 'MetaString'; readonly c: string }
  | { readonly t: 'MetaInlines'; readonly c: readonly Inline[] }
  | { readonly t: 'MetaBlocks'; readonly c: readonly Block[] };

export type Meta = { readonly [key: string]: MetaValue };

export interface Doc {
  readonly 'pandoc-api-version': ApiVersion;
  readonly meta: Meta;
  readonly blocks: readonly Block[];
}

export const emptyDoc = (blocks: readonly Block[] = [], meta: Meta = {}): Doc => ({
  'pandoc-api-version': PANDOC_API_VERSION,
  meta,
  blocks,
});
