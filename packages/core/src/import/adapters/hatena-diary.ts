import type { ImportEntry } from '../types.ts';
import {
  decodeXmlContent,
  extractCategoryTerms,
  extractDraftFlag,
  extractElementText,
  extractHatenaFormattedContent,
  parseAtomTimestamp,
  splitAtomEntryFragments,
} from '../atom-parse.ts';

export interface ParseHatenaDiaryExportOptions {
  readonly skipDrafts?: boolean;
}

/**
 * Parse はてなダイアリー / はてなブログ Atom export into import entries.
 * Body priority: hatena:formatted-content → content (html) → hatena:syntax → content.
 */
export function parseHatenaDiaryExport(
  text: string,
  opts?: ParseHatenaDiaryExportOptions,
): ImportEntry[] {
  const skipDrafts = opts?.skipDrafts !== false;
  const entries: ImportEntry[] = [];

  for (const fragment of splitAtomEntryFragments(text)) {
    const isDraft = extractDraftFlag(fragment);
    const status = isDraft ? 'draft' : 'publish';
    if (skipDrafts && status !== 'publish') continue;

    const title = extractElementText(fragment, ['title']) ?? 'Untitled';
    const sourceId =
      extractElementText(fragment, ['id']) ??
      extractLinkHref(fragment, 'edit') ??
      extractLinkHref(fragment, 'alternate') ??
      `hatena:${title}`;

    const timestamp = parseAtomTimestamp(fragment) ?? new Date().toISOString();
    const categories = extractCategoryTerms(fragment);
    const body = resolveBody(fragment);

    entries.push({
      sourceId,
      title,
      timestamp,
      status,
      categories: categories.length > 0 ? categories : undefined,
      body,
    });
  }

  return entries;
}

function resolveBody(fragment: string): string {
  const formatted = extractHatenaFormattedContent(fragment);
  if (formatted !== undefined && formatted.length > 0) return formatted;

  const contentHtml = extractContentByType(fragment, 'text/html');
  if (contentHtml !== undefined && contentHtml.length > 0) return contentHtml;

  const syntax = extractElementText(fragment, ['syntax']);
  if (syntax !== undefined && syntax.length > 0) return syntax;

  const content = extractElementText(fragment, ['content', 'encoded']);
  if (content !== undefined && content.length > 0) return content;

  const summary = extractElementText(fragment, ['summary']);
  return summary ?? '';
}

function extractContentByType(fragment: string, type: string): string | undefined {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?content\\b[^>]*\\btype=["']${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?content>`,
    'i',
  );
  const m = re.exec(fragment);
  return m ? decodeXmlContent(m[1]!.trim()) : undefined;
}

function extractLinkHref(fragment: string, rel: string): string | undefined {
  const re = new RegExp(
    `<link\\b[^>]*\\brel=["']${rel}["'][^>]*\\bhref=["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(fragment);
  return m?.[1];
}