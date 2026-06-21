import type { GlossaryLinkIndex } from "./glossary-link-index.ts";

const TERM_LINK_RE = /\[\[term:([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/** 本文中の未解決 `[[term:…]]` を検出する。 */
export function validateTermLinkWarnings(
  body: string,
  index: GlossaryLinkIndex,
): readonly string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(TERM_LINK_RE)) {
    const termId = m[1]!.trim();
    if (termId.length === 0 || seen.has(termId)) continue;
    seen.add(termId);
    if (!index.has(termId)) {
      warnings.push(`unresolved glossary term link: [[term:${termId}]]`);
    }
  }
  return warnings;
}