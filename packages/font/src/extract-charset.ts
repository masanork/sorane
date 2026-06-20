import { BASELINE_CODEPOINTS } from "./baseline-charset.ts";

/** HTML からタグを除いた可視テキスト（フォントサブセット用） */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "");
}

export function extractCharset(
  body: string,
  title = "",
  baseline: ReadonlySet<number> = BASELINE_CODEPOINTS,
  extra = "",
): string {
  const codepoints = new Set<number>(baseline);
  for (const ch of title + body + extra) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) codepoints.add(cp);
  }
  const sorted = [...codepoints].sort((a, b) => a - b);
  return String.fromCodePoint(...sorted);
}