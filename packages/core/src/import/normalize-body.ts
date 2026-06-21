import type { GlyphSubstitutionMap } from './glyph-map.ts';
import { applyGlyphSubstitution } from './glyph-map.ts';
import { normalizeHatenaKeywordLinks } from './normalize-html.ts';

export interface NormalizeImportBodyOptions {
  readonly normalizeHtml?: boolean;
  readonly glyphMap?: GlyphSubstitutionMap;
}

/** Post-adapter cleanup for imported article bodies. */
export function normalizeImportBody(body: string, opts?: NormalizeImportBodyOptions): string {
  let out = body;

  if (opts?.normalizeHtml !== false) {
    out = normalizeHatenaKeywordLinks(out);
  }

  if (opts?.glyphMap !== undefined && opts.glyphMap.size > 0) {
    out = applyGlyphSubstitution(out, opts.glyphMap);
  }

  return out;
}