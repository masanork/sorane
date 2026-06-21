// ルビベース文字 (漢字連続) 判定の純粋関数。
// design/markup-interchange.md (bunsen specs/004-ruby-annotations 互換)。

const HAN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f],
  [0x2b820, 0x2ceaf],
  [0x2ceb0, 0x2ebef],
  [0x30000, 0x3134f],
  [0x31350, 0x323af],
  [0xf900, 0xfaff],
  [0x2f800, 0x2fa1f],
] as const;

const HAN_SYMBOLS: ReadonlySet<number> = new Set([0x3005, 0x3006, 0x3007]);
const IVS_RANGE: readonly [number, number] = [0xe0100, 0xe01ef];

export function isBaseChar(cp: number): boolean {
  if (HAN_SYMBOLS.has(cp)) return true;
  if (cp >= IVS_RANGE[0] && cp <= IVS_RANGE[1]) return true;
  for (const [start, end] of HAN_RANGES) {
    if (cp >= start && cp <= end) return true;
  }
  return false;
}