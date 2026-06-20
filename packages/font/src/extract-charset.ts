import { BASELINE_CODEPOINTS } from "./baseline-charset.ts";

export function extractCharset(
  body: string,
  title = "",
  baseline: ReadonlySet<number> = BASELINE_CODEPOINTS,
): string {
  const codepoints = new Set<number>(baseline);
  for (const ch of title + body) {
    codepoints.add(ch.codePointAt(0)!);
  }
  const sorted = [...codepoints].sort((a, b) => a - b);
  return String.fromCodePoint(...sorted);
}