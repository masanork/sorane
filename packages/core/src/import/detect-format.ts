import type { ImportFormatId } from './types.ts';

/** Sniff export format from decoded text. */
export function detectImportFormat(text: string): ImportFormatId {
  if (looksLikeMtExport(text)) return 'mt';
  if (looksLikeHatenaDiaryAtom(text)) return 'hatena-diary';
  if (looksLikeWordPressWxr(text)) return 'wordpress';
  return 'unknown';
}

function looksLikeMtExport(text: string): boolean {
  return text.includes('--------\n') && /TITLE:/m.test(text) && /BODY:/m.test(text);
}

function looksLikeHatenaDiaryAtom(text: string): boolean {
  const t = text.trimStart();
  return (
    (t.startsWith('<?xml') || t.startsWith('<feed')) &&
    (text.includes('xmlns:hatena') || text.includes('hatena.ne.jp'))
  );
}

function looksLikeWordPressWxr(text: string): boolean {
  return (
    text.includes('wordpress.com/export') ||
    (text.includes('<rss') && text.includes('wp:post_type'))
  );
}

export function resolveImportFormat(requested: string, text: string): ImportFormatId {
  const norm = requested.trim().toLowerCase();
  if (norm === 'auto') {
    const detected = detectImportFormat(text);
    if (detected === 'unknown') {
      throw new Error('could not detect import format; use --format mt|hatena-diary|wordpress');
    }
    return detected;
  }
  if (norm === 'mt' || norm === 'hatena-diary' || norm === 'wordpress') {
    return norm;
  }
  throw new Error(`unsupported --format: ${requested} (supported: auto, mt)`);
}