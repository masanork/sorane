function range(start: number, endInclusive: number): number[] {
  const out: number[] = [];
  for (let cp = start; cp <= endInclusive; cp++) out.push(cp);
  return out;
}

const PUNCT_AND_SYMBOLS: readonly string[] = [
  "、", "。", "〈", "〉", "《", "》", "「", "」", "『", "』",
  "【", "】", "〒", "〓", "〔", "〕", "〜", "・", "…", "‥",
  "―", "─",
  "〇", "々", "〆", "ヶ", "※",
  "：", "；", "！", "？", "（", "）", "｛", "｝",
  "［", "］", "＜", "＞",
];

const codepoints = new Set<number>();
for (const cp of range(0x0020, 0x007e)) codepoints.add(cp);
for (const cp of range(0x3041, 0x3096)) codepoints.add(cp);
for (const cp of range(0x30a1, 0x30f6)) codepoints.add(cp);
for (const cp of range(0xff10, 0xff19)) codepoints.add(cp);
for (const cp of range(0xff21, 0xff3a)) codepoints.add(cp);
for (const cp of range(0xff41, 0xff5a)) codepoints.add(cp);
for (const cp of range(0xff66, 0xff9d)) codepoints.add(cp);
for (const ch of PUNCT_AND_SYMBOLS) codepoints.add(ch.codePointAt(0)!);

export const BASELINE_CODEPOINTS: ReadonlySet<number> = codepoints;