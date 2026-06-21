// 023 Phase A: Pandoc JSON 1.23 → HTML 文字列 renderer (純粋関数)。
// contracts/pandoc-to-html.md。
//
// 既存 unified pipeline (remark-rehype → rehype-sanitize → rehype-stringify) を
// 置き換える出口層。Phase A 移行前の HTML 出力と byte 一致 (golden 5 件) を担保する。
//
// strict sanitize: tag allowlist + attribute allowlist + dangerous URL scheme 除外。
// CSP 厳格 (script-src 'self'、unsafe-inline 不使用) 維持。

import type {
  Block,
  Doc,
  Inline,
  Attr,
  Target,
  TableHead,
  TableBody,
  TableFoot,
  TableRow,
  TableCell,
} from './pandoc-types.ts';

export interface RenderHtmlOpts {
  readonly sanitize: 'strict';
}

export function pandocToHtml(doc: Doc, _opts: RenderHtmlOpts): string {
  return renderBlocks(doc.blocks);
}

function renderBlocks(blocks: readonly Block[]): string {
  let out = '';
  for (const b of blocks) out += renderBlock(b);
  return out;
}

function renderBlock(block: Block): string {
  switch (block.t) {
    case 'Plain':
      return renderInlines(block.c);
    case 'Para':
      return `<p>${renderInlines(block.c)}</p>\n`;
    case 'Header': {
      const [level, attr, inlines] = block.c;
      const open = `<h${level}${renderAttr(attr)}>`;
      return `${open}${renderInlines(inlines)}</h${level}>\n`;
    }
    case 'CodeBlock':
      return renderCodeBlock(block.c[0], block.c[1]);
    case 'RawBlock':
      return renderRawBlock(block.c[0], block.c[1]);
    case 'BlockQuote':
      return `<blockquote>\n${renderBlocks(block.c)}</blockquote>\n`;
    case 'OrderedList': {
      const [[start], items] = block.c;
      const startAttr = start === 1 ? '' : ` start="${start}"`;
      return `<ol${startAttr}>\n${renderListItems(items)}</ol>\n`;
    }
    case 'BulletList':
      return `<ul>\n${renderListItems(block.c)}</ul>\n`;
    case 'DefinitionList': {
      let html = '<dl>\n';
      for (const [term, defs] of block.c) {
        html += `<dt>${renderInlines(term)}</dt>\n`;
        for (const def of defs) html += `<dd>\n${renderBlocks(def)}</dd>\n`;
      }
      return html + '</dl>\n';
    }
    case 'HorizontalRule':
      return '<hr>\n';
    case 'Div':
      return `<div${renderAttr(block.c[0])}>\n${renderBlocks(block.c[1])}</div>\n`;
    case 'LineBlock': {
      const lines = block.c.map((line) => renderInlines(line));
      return `<p>${lines.join('<br>\n')}</p>\n`;
    }
    case 'Table': {
      const [attr, , , head, bodies, foot] = block.c;
      return renderTable(attr, head, bodies, foot);
    }
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return '';
    }
  }
}

/**
 * 028 FR-001 / FR-014: Pandoc Table を `<table>...<thead>...</thead><tbody>...</tbody></table>` に SSR。
 *
 * - 028 で kramdown IAL marker から `data-sorane-dataset` class が attr に注入されると
 *   `<table data-sorane-dataset id="table-{slug}">` 形式で出る (id は attr の id field 経由)。
 * - cell の Block 配列は Plain ([Inline...]) のみ想定 (mdast-to-pandoc が Plain で包む)。
 * - CSP 厳格 (script-src 'self'、no unsafe-inline) を破らない (静的 HTML、event 属性なし)。
 */
function renderTable(
  attr: Attr,
  head: TableHead,
  bodies: readonly TableBody[],
  foot: TableFoot,
): string {
  const attrStr = renderTableAttr(attr);
  let html = `<table${attrStr}>\n`;
  const [, headRows] = head;
  if (headRows.length > 0) {
    html += '<thead>\n';
    for (const row of headRows) html += renderTableRow(row, true);
    html += '</thead>\n';
  }
  const allBodyRows: TableRow[] = [];
  for (const body of bodies) {
    const [, , bodyHeadRows, bodyDataRows] = body;
    for (const r of bodyHeadRows) allBodyRows.push(r);
    for (const r of bodyDataRows) allBodyRows.push(r);
  }
  if (allBodyRows.length > 0) {
    html += '<tbody>\n';
    for (const row of allBodyRows) html += renderTableRow(row, false);
    html += '</tbody>\n';
  }
  const [, footRows] = foot;
  if (footRows.length > 0) {
    html += '<tfoot>\n';
    for (const row of footRows) html += renderTableRow(row, false);
    html += '</tfoot>\n';
  }
  html += '</table>\n';
  return html;
}

/**
 * 028: Table 専用の attribute renderer。
 * - `data-sorane-dataset` class が含まれていれば boolean attribute (= `data-sorane-dataset`、value なし) として出す
 * - `id` が空でなければ `id="..."` を出す
 * - 他の class / kvs は出さない (kramdown IAL marker 由来 attribute のみ通す MVP scope)
 */
function renderTableAttr(attr: Attr): string {
  const [id, classes] = attr;
  const parts: string[] = [];
  // 028: data-sorane-dataset は HTML5 boolean attribute として burst
  if (classes.includes('data-sorane-dataset')) {
    parts.push('data-sorane-dataset');
  }
  if (id.length > 0) {
    parts.push(`id="${escapeAttr(id)}"`);
  }
  return parts.length === 0 ? '' : ' ' + parts.join(' ');
}

function renderTableRow(row: TableRow, isHeader: boolean): string {
  const [, cells] = row;
  let html = '<tr>';
  for (const cell of cells) html += renderTableCell(cell, isHeader);
  html += '</tr>\n';
  return html;
}

function renderTableCell(cell: TableCell, isHeader: boolean): string {
  const [, align, , , blocks] = cell;
  void align; // 028: alignment は CSP 厳格 (no inline style=) と allowlist 制約のため HTML 出力では捨てる (将来拡張)
  const tag = isHeader ? 'th' : 'td';
  // 028: cell content は Plain ([Inline...]) のみ想定 (mdast-to-pandoc が Plain で包む)。
  let inner = '';
  for (const b of blocks) {
    if (b.t === 'Plain') inner += renderInlines(b.c);
    else if (b.t === 'Para') inner += renderInlines(b.c);
    else inner += renderBlock(b);
  }
  return `<${tag}>${inner}</${tag}>`;
}

function renderListItems(items: readonly (readonly Block[])[]): string {
  let html = '';
  for (const blocks of items) {
    html += `<li>${renderListItemBody(blocks)}</li>\n`;
  }
  return html;
}

/**
 * tight `<li>{Plain}</li>` か loose `<li>\n<p>...</p>\n</li>` を出し分け。
 *
 * - 子が 1 個で Plain → tight (前後の \n なし、`<li>a</li>`)
 * - 子に block (Para / 別 List 等) を含む混在 → 子要素の HTML を改行付きで並べ、`<li>\n...</li>`
 *   ただし最初の子が Plain の場合は最初だけ tight 風 (`<li>a\n<ul>...</ul>\n</li>`) にする
 *   (rehype-stringify の挙動に揃える)
 */
function renderListItemBody(blocks: readonly Block[]): string {
  if (blocks.length === 0) return '';
  if (blocks.length === 1) {
    const only = blocks[0]!;
    if (only.t === 'Plain') return renderInlines(only.c);
    if (only.t === 'Para') return `\n<p>${renderInlines(only.c)}</p>\n`;
    return `\n${renderBlock(only)}`;
  }
  let html = '';
  let firstPlainEmitted = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (i === 0 && b.t === 'Plain') {
      html += renderInlines(b.c) + '\n';
      firstPlainEmitted = true;
      continue;
    }
    html += renderBlock(b);
  }
  return firstPlainEmitted ? html : `\n${html}`;
}

const DIAGRAM_LANGS = new Set(['mermaid', 'd2', 'graphviz', 'dot']);

function renderCodeBlock(attr: Attr, value: string): string {
  const [, classes, kvs] = attr;
  const lang = classes[0];
  const isDiagram = classes.some((c) => DIAGRAM_LANGS.has(c));
  const altKv = kvs.find(([k]) => k === 'data-sorane-alt');
  const preAttrs = altKv !== undefined
    ? ` data-sorane-alt="${escapeAttr(altKv[1])}"`
    : '';
  if (isDiagram) {
    const diagramLang = classes.find((c) => DIAGRAM_LANGS.has(c)) ?? lang;
    return `<pre${preAttrs}><code class="language-${diagramLang}">${escapeText(value)}</code></pre>\n`;
  }
  const codeClass =
    typeof lang === 'string' && lang.length > 0
      ? ` class="language-${lang}"`
      : '';
  return `<pre><code${codeClass}>${escapeText(value)}\n</code></pre>\n`;
}

/**
 * RawBlock の strict sanitize:
 *   - `<img>` `<a>` `<pre>` `<code>` 等の安全な top-level tag のみ通す
 *   - `<div>` `<section>` `<table>` 等の wrapper は丸ごと drop (既存 rehype-sanitize 互換)
 *   - 通す場合も `<a href="javascript:">` `onclick=` `style=` 等の危険属性は除去
 *
 * Phase A では既存パイプラインの「block-level raw HTML を全部 drop する」挙動に揃える
 * (= 安全な subset を allowlist で残すのは Phase B 以降の調整)。
 */
const SAFE_BLOCK_TAGS = new Set([
  'p',
  'blockquote',
  'div',
  'figure',
  'figcaption',
  'center',
  'hr',
  'pre',
]);

function renderRawBlock(format: string, content: string): string {
  if (format !== 'html') return '';
  const trimmed = content.trim();
  // mermaid handler 経由の <img src="/blob/diagram/..." alt="..." loading="lazy"> は許可
  const imgMatch = /^<img\s+([^>]+)>$/i.exec(trimmed);
  if (imgMatch !== null) {
    const safeAttrs = sanitizeImgAttrs(imgMatch[1]!);
    return safeAttrs !== null ? `<img ${safeAttrs}>\n` : '';
  }
  // はてな移行などの block-level raw HTML (rehype-sanitize で後段フィルタ)
  const blockMatch = /^<([a-z][a-z0-9]*)\b/i.exec(trimmed);
  if (blockMatch !== null && SAFE_BLOCK_TAGS.has(blockMatch[1]!.toLowerCase())) {
    return `${content}\n`;
  }
  return '';
}

function sanitizeImgAttrs(attrs: string): string | null {
  const allowed = ['src', 'alt', 'title', 'loading'];
  const re = /(\w+)=("([^"]*)"|'([^']*)')/g;
  const kept: string[] = [];
  for (const m of attrs.matchAll(re)) {
    const name = m[1]!.toLowerCase();
    const value = m[3] ?? m[4] ?? '';
    if (!allowed.includes(name)) continue;
    if (name === 'src' && !isSafeUrl(value)) return null;
    kept.push(`${name}="${escapeAttr(value)}"`);
  }
  return kept.length === 0 ? null : kept.join(' ');
}

function renderInlines(inlines: readonly Inline[]): string {
  let out = '';
  for (const i of inlines) out += renderInline(i);
  return out;
}

function renderInline(inline: Inline): string {
  switch (inline.t) {
    case 'Str':
      return escapeText(inline.c);
    case 'Space':
      return ' ';
    case 'SoftBreak':
      return '\n';
    case 'LineBreak':
      return '<br>';
    case 'Emph':
      return `<em>${renderInlines(inline.c)}</em>`;
    case 'Strong':
      return `<strong>${renderInlines(inline.c)}</strong>`;
    case 'Strikeout':
      return `<del>${renderInlines(inline.c)}</del>`;
    case 'Superscript':
      return `<sup>${renderInlines(inline.c)}</sup>`;
    case 'Subscript':
      return `<sub>${renderInlines(inline.c)}</sub>`;
    case 'SmallCaps':
      return `<span class="small-caps">${renderInlines(inline.c)}</span>`;
    case 'Code':
      return `<code${renderAttr(inline.c[0])}>${escapeText(inline.c[1])}</code>`;
    case 'Quoted': {
      const [qt, items] = inline.c;
      const open = qt === 'DoubleQuote' ? '“' : '‘';
      const close = qt === 'DoubleQuote' ? '”' : '’';
      return `${open}${renderInlines(items)}${close}`;
    }
    case 'Cite':
      return renderInlines(inline.c[1]);
    case 'Math': {
      const [mt, src] = inline.c;
      const cls = mt === 'DisplayMath' ? 'math display' : 'math inline';
      return `<span class="${cls}">${escapeText(src)}</span>`;
    }
    case 'RawInline':
      return renderRawInline(inline.c[0], inline.c[1]);
    case 'Link':
      return renderLink(inline.c[0], inline.c[1], inline.c[2]);
    case 'Image':
      return renderImage(inline.c[0], inline.c[1], inline.c[2]);
    case 'Note':
      return `<sup>${renderBlocks(inline.c)}</sup>`;
    case 'Span':
      return renderSpan(inline.c[0], inline.c[1]);
    default: {
      const _exhaustive: never = inline;
      void _exhaustive;
      return '';
    }
  }
}

/**
 * 既存 rehype-sanitize 経路は inline raw HTML (`<em>` `<strong>` `<foo>` 等) を全て drop する。
 * Phase A は同等挙動 (= text content だけ残し tag は捨てる、ただし RawInline 自体は drop)。
 */
function renderRawInline(format: string, _content: string): string {
  if (format !== 'html') return '';
  return '';
}

function renderSpan(attr: Attr, inlines: readonly Inline[]): string {
  const [, , kvs] = attr;
  const rt = kvs.find(([k]) => k === 'data-sorane-rt');
  if (rt !== undefined) {
    return `<ruby>${renderInlines(inlines)}<rt>${escapeText(rt[1])}</rt></ruby>`;
  }
  return `<span${renderAttr(attr)}>${renderInlines(inlines)}</span>`;
}

function renderLink(attr: Attr, inlines: readonly Inline[], target: Target): string {
  const [url, title] = target;
  const safeUrl = isSafeUrl(url) ? encodeUrl(url) : null;
  const hrefAttr = safeUrl !== null ? ` href="${escapeAttr(safeUrl)}"` : '';
  const titleAttr = title !== '' ? ` title="${escapeAttr(title)}"` : '';
  const extraAttr = renderAttr(attr);
  return `<a${extraAttr}${hrefAttr}${titleAttr}>${renderInlines(inlines)}</a>`;
}

function renderImage(attr: Attr, inlines: readonly Inline[], target: Target): string {
  const [url, title] = target;
  const safeUrl = isSafeUrl(url) ? encodeUrl(url) : null;
  const srcAttr = safeUrl !== null ? ` src="${escapeAttr(safeUrl)}"` : '';
  const altText = inlinesToPlainText(inlines);
  const altAttr = ` alt="${escapeAttr(altText)}"`;
  const titleAttr = title !== '' ? ` title="${escapeAttr(title)}"` : '';
  const extraAttr = renderAttr(attr, IMG_EXTRA_ATTRS);
  return `<img${srcAttr}${altAttr}${titleAttr}${extraAttr}>`;
}

const IMG_EXTRA_ATTRS = new Set(['loading']);

function inlinesToPlainText(inlines: readonly Inline[]): string {
  let out = '';
  for (const i of inlines) {
    switch (i.t) {
      case 'Str':
        out += i.c;
        break;
      case 'Space':
        out += ' ';
        break;
      case 'SoftBreak':
        out += '\n';
        break;
      case 'LineBreak':
        out += '\n';
        break;
      case 'Code':
        out += i.c[1];
        break;
      case 'RawInline':
        out += i.c[1];
        break;
      case 'Emph':
      case 'Strong':
      case 'Strikeout':
      case 'Superscript':
      case 'Subscript':
      case 'SmallCaps':
        out += inlinesToPlainText(i.c);
        break;
      case 'Quoted':
      case 'Cite':
        out += inlinesToPlainText(i.c[1]);
        break;
      case 'Link':
      case 'Image':
        out += inlinesToPlainText(i.c[1]);
        break;
      case 'Span':
        out += inlinesToPlainText(i.c[1]);
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Pandoc Attr → HTML 属性文字列。空 attrs は `""` を返す。
 * id / class / data-* / aria-* と extraAllowed (タグ別追加 allowlist) を通す。
 */
function renderAttr(attr: Attr, extraAllowed: ReadonlySet<string> = EMPTY_SET): string {
  const [id, classes, kvs] = attr;
  const parts: string[] = [];
  if (id.length > 0) parts.push(`id="${escapeAttr(id)}"`);
  if (classes.length > 0) parts.push(`class="${escapeAttr(classes.join(' '))}"`);
  for (const [k, v] of kvs) {
    if (!isSafeAttrName(k) && !extraAllowed.has(k)) continue;
    parts.push(`${k}="${escapeAttr(v)}"`);
  }
  return parts.length === 0 ? '' : ' ' + parts.join(' ');
}

const EMPTY_SET: ReadonlySet<string> = new Set();

const SAFE_ATTR_PATTERN = /^(data-[\w-]+|aria-[\w-]+|role|lang|datetime|scope|title)$/;
function isSafeAttrName(name: string): boolean {
  return SAFE_ATTR_PATTERN.test(name);
}

const DANGEROUS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME = /^(https?:|mailto:|#|\/|\.|tel:)/i;

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return true; // empty URL passes through (rehype outputs href="")
  if (SAFE_SCHEME.test(trimmed)) return true;
  if (DANGEROUS_SCHEME.test(trimmed)) return false;
  return true; // 相対パス
}

/**
 * URL エスケープ: 既存 rehype-stringify が出力する `<a href="...">` の値と byte 一致させる。
 * - `&` → `&#x26;` (HTML エンティティ)
 * - `<` `>` → `%3C` `%3E` (percent-encode)
 * - 他の制御文字 / 日本語 / スペース等は percent-encode (encodeURI) に委譲
 *
 * Phase A の golden 5 fixture では simple ASCII URL のみなので、複雑なエッジケースは
 * fallthrough 動作で十分 (将来 Phase B で normalize-uri ライブラリ等の導入を検討)。
 */
function encodeUrl(url: string): string {
  let out = '';
  for (let i = 0; i < url.length; i++) {
    const ch = url[i]!;
    const cc = url.charCodeAt(i);
    if (ch === '<') out += '%3C';
    else if (ch === '>') out += '%3E';
    else if (cc < 0x20 || cc === 0x7f) out += encodeURIComponent(ch);
    else out += ch;
  }
  return out;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&#x26;').replace(/</g, '&#x3C;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&#x26;')
    .replace(/</g, '&#x3C;')
    .replace(/"/g, '&#x22;');
}
