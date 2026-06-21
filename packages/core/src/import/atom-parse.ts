/** Lightweight Atom entry extraction (namespace-tolerant, no external XML lib). */

export function splitAtomEntryFragments(xml: string): string[] {
  const entries: string[] = [];
  const re = /<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    entries.push(m[0]!);
  }
  return entries;
}

export function extractElementText(fragment: string, localNames: readonly string[]): string | undefined {
  for (const name of localNames) {
    const re = new RegExp(
      `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,
      'i',
    );
    const m = re.exec(fragment);
    if (m) return decodeXmlContent(m[1]!.trim());
  }
  return undefined;
}

export function extractHatenaFormattedContent(fragment: string): string | undefined {
  const open = fragment.search(/<(?:hatena:)?formatted-content\b/i);
  if (open < 0) return undefined;
  const start = fragment.indexOf('>', open);
  if (start < 0) return undefined;
  const tail = fragment.slice(start + 1);
  const close = tail.search(/<\/(?:hatena:)?formatted-content>/i);
  if (close < 0) return undefined;
  return decodeXmlContent(tail.slice(0, close).trim());
}

export function extractCategoryTerms(fragment: string): string[] {
  const terms: string[] = [];
  const re = /<(?:[\w.-]+:)?category\b[^>]*\bterm=["']([^"']+)["'][^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    terms.push(decodeXmlContent(m[1]!));
  }
  return terms;
}

export function extractDraftFlag(fragment: string): boolean {
  const m = fragment.match(/<(?:app:)?draft[^>]*>\s*(yes|true|1)\s*<\/(?:app:)?draft>/i);
  return m !== null;
}

export function parseAtomTimestamp(fragment: string): string | undefined {
  const raw =
    extractElementText(fragment, ['published', 'issued', 'updated', 'modified']) ??
    extractDcDate(fragment);
  if (raw === undefined) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function extractDcDate(fragment: string): string | undefined {
  const m = fragment.match(/<(?:dc:)?date[^>]*>([\s\S]*?)<\/(?:dc:)?date>/i);
  return m ? decodeXmlContent(m[1]!.trim()) : undefined;
}

export function decodeXmlContent(raw: string): string {
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  const text = cdata ? cdata[1]! : raw;
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}