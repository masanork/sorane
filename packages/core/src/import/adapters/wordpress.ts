import type { ImportEntry } from '../types.ts';
import {
  decodeXmlContent,
  extractElementText,
} from '../atom-parse.ts';

export interface ParseWordPressWxrExportOptions {
  readonly skipDrafts?: boolean;
}

/** Split WXR `<item>…</item>` fragments (namespace-tolerant). */
export function splitWxrItemFragments(xml: string): string[] {
  const items: string[] = [];
  const re = /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    items.push(m[0]!);
  }
  return items;
}

/**
 * Parse WordPress WXR export into import entries.
 * Keeps `wp:post_type=post` only; body from `content:encoded`.
 */
export function parseWordPressWxrExport(
  text: string,
  opts?: ParseWordPressWxrExportOptions,
): ImportEntry[] {
  const skipDrafts = opts?.skipDrafts !== false;
  const entries: ImportEntry[] = [];

  for (const fragment of splitWxrItemFragments(text)) {
    const postType = extractElementText(fragment, ['post_type'])?.trim().toLowerCase();
    if (postType !== 'post') continue;

    const statusRaw = extractElementText(fragment, ['status'])?.trim().toLowerCase() ?? 'publish';
    const status = statusRaw === 'publish' ? 'publish' : 'draft';
    if (skipDrafts && status !== 'publish') continue;

    const title = extractElementText(fragment, ['title']) ?? 'Untitled';
    const sourceId =
      extractElementText(fragment, ['guid']) ??
      extractItemLink(fragment) ??
      `wp:${extractElementText(fragment, ['post_id']) ?? title}`;

    const timestamp = parseWpTimestamp(fragment) ?? new Date().toISOString();
    const categories = extractWpCategories(fragment);
    const body =
      extractElementText(fragment, ['encoded']) ??
      extractElementText(fragment, ['excerpt']) ??
      '';

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

function extractItemLink(fragment: string): string | undefined {
  const m = fragment.match(/<link>([^<]*)<\/link>/i);
  return m ? decodeXmlContent(m[1]!.trim()) : undefined;
}

function parseWpTimestamp(fragment: string): string | undefined {
  const postDate = extractElementText(fragment, ['post_date']);
  if (postDate !== undefined) {
    const normalized = postDate.trim().replace(' ', 'T');
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const pubDate = extractElementText(fragment, ['pubDate']);
  if (pubDate !== undefined) {
    const d = new Date(pubDate.trim());
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function extractWpCategories(fragment: string): string[] {
  const terms: string[] = [];
  const re =
    /<category\b[^>]*\bdomain=["'](?:category|post_tag)["'][^>]*>([\s\S]*?)<\/category>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    const label = decodeXmlContent(m[1]!.trim());
    if (label.length > 0) terms.push(label);
  }
  return terms;
}