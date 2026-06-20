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

/** 単一フォント（後方互換）。 */
export function buildFontFaceCss(family: string, woff2Url: string, weight = "450"): string {
  return (
    `<style>\n` +
    `${fontFaceRule({ family, url: woff2Url, weight })}\n` +
    `body { font-family: '${family}', system-ui, sans-serif; font-weight: ${weight}; }\n` +
    `</style>`
  );
}

/** 複数フォントスタック。本文の font-family は main.css 側で定義する。 */
export function buildFontStackCss(faces: readonly FontFaceEntry[]): string {
  if (faces.length === 0) return "";
  return `<style>\n${faces.map(fontFaceRule).join("\n")}\n</style>`;
}