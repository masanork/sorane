export interface FontFaceEntry {
  readonly family: string;
  readonly url: string;
  readonly weight: string;
  readonly format?: "woff2" | "truetype" | "opentype";
}

function fontFaceRule(entry: FontFaceEntry): string {
  const format = entry.format ?? "woff2";
  return (
    `@font-face {\n` +
    `  font-family: '${entry.family}';\n` +
    `  src: url('${entry.url}') format('${format}');\n` +
    `  font-weight: ${entry.weight};\n` +
    `  font-style: normal;\n` +
    `  font-display: swap;\n` +
    `}`
  );
}

/** 複数フォントスタック。本文の font-family は main.css 側で定義する。 */
export function buildFontStackCss(faces: readonly FontFaceEntry[]): string {
  if (faces.length === 0) return "";
  return `<style>\n${faces.map(fontFaceRule).join("\n")}\n</style>`;
}
