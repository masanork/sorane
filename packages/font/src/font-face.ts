export function buildFontFaceCss(family: string, woff2Url: string, weight = "450"): string {
  return (
    `<style>\n` +
    `@font-face {\n` +
    `  font-family: '${family}';\n` +
    `  src: url('${woff2Url}') format('woff2');\n` +
    `  font-weight: ${weight};\n` +
    `  font-style: normal;\n` +
    `  font-display: swap;\n` +
    `}\n` +
    `body { font-family: '${family}', system-ui, sans-serif; font-weight: ${weight}; }\n` +
    `</style>`
  );
}