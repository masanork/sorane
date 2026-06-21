import type { EncodingName } from './types.ts';

const XML_ENCODING_RE = /encoding\s*=\s*["']([^"']+)["']/i;

/** Scan leading bytes for XML/HTML encoding declaration. */
export function parseXmlEncodingDeclaration(data: Uint8Array, maxScan = 512): string | undefined {
  const len = Math.min(data.length, maxScan);
  let ascii = '';
  for (let i = 0; i < len; i++) {
    const b = data[i] ?? 0;
    if (b === 0) break;
    ascii += String.fromCharCode(b);
  }
  const m = XML_ENCODING_RE.exec(ascii);
  return m?.[1]?.trim();
}

/** Map declaration label to sorane EncodingName. */
export function normalizeEncodingLabel(label: string): EncodingName | undefined {
  const norm = label.trim().toLowerCase().replace(/_/g, '-');
  const map: Record<string, EncodingName> = {
    'utf-8': 'UTF-8',
    utf8: 'UTF-8',
    'utf-16': 'UTF-16LE',
    'utf-16le': 'UTF-16LE',
    'utf-16be': 'UTF-16BE',
    ascii: 'ASCII',
    'shift-jis': 'Shift_JIS',
    shiftjis: 'Shift_JIS',
    sjis: 'Shift_JIS',
    'windows-31j': 'Shift_JIS',
    cp932: 'Shift_JIS',
    'euc-jp': 'EUC-JP',
    eucjp: 'EUC-JP',
    'iso-2022-jp': 'Shift_JIS',
  };
  return map[norm];
}