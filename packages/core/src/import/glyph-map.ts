import { readFileSync } from 'node:fs';

/** gjs `substitute_jisx0213_mj_1.0.txt` row → target codepoint string. */
export type GlyphSubstitutionMap = ReadonlyMap<number, string>;

function parseUPlusCodepoint(token: string): number | undefined {
  const m = /^U\+([0-9A-Fa-f]+)$/.exec(token.trim());
  if (!m) return undefined;
  const cp = Number.parseInt(m[1]!, 16);
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return undefined;
  return cp;
}

/**
 * Parse gjs MJ/JIS substitute TSV (代替元 / 代替先 / 区分).
 * Types 1 (substitution) and 2 (inclusion) are applied; 0/3 skipped.
 * IVS (`<U+XXXX,U+E0101>`) and GJ (`G…`) rows are skipped.
 */
export function parseGjsSubstituteMap(text: string): GlyphSubstitutionMap {
  const map = new Map<number, string>();

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('代替')) continue;

    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const src = parts[0]!.trim();
    const tgt = parts[1]!.trim();
    const typ = parts[2]!.trim();

    if (typ === '0' || typ === '3') continue;
    if (src.includes('<') || tgt.includes('<')) continue;
    if (src.startsWith('G') || tgt.startsWith('G')) continue;

    const srcCp = parseUPlusCodepoint(src);
    const tgtCp = parseUPlusCodepoint(tgt);
    if (srcCp === undefined || tgtCp === undefined || srcCp === tgtCp) continue;
    if (map.has(srcCp)) continue;

    map.set(srcCp, String.fromCodePoint(tgtCp));
  }

  return map;
}

/** Load substitute map from a gjs-format TSV file. */
export function loadGlyphSubstitutionMap(path: string): GlyphSubstitutionMap {
  return parseGjsSubstituteMap(readFileSync(path, 'utf8'));
}

/** Apply codepoint substitutions to UTF-16 text (astral-safe). */
export function applyGlyphSubstitution(text: string, map: GlyphSubstitutionMap): string {
  if (map.size === 0) return text;

  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    const repl = map.get(cp);
    out += repl ?? char;
  }
  return out;
}