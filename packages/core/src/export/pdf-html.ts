/**
 * Prepare built dist HTML for Vivliostyle PDF export.
 * Strips interactive chrome and links print stylesheet.
 */

const MAIN_CSS_LINK_RE =
  /(<link rel="stylesheet" href="([^"]*)assets\/main\.css">)/;

const SEARCH_SCRIPT_RE =
  /<script type="module" src="[^"]*assets\/search\.mjs"><\/script>\s*/g;

/** Transform dist HTML for PDF rendering (non-destructive; caller writes temp file). */
export function prepareHtmlForPdf(html: string): string {
  let out = html.replace(SEARCH_SCRIPT_RE, "");

  const m = MAIN_CSS_LINK_RE.exec(out);
  if (m !== null) {
    const prefix = m[2]!;
    const printLink = `<link rel="stylesheet" href="${prefix}assets/print.css">`;
    out = out.replace(m[1]!, `${m[1]}\n${printLink}`);
  }

  return out;
}