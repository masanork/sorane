/** Strip はてな keyword / okeyword anchor wrappers; keep link text. */

const KEYWORD_CLASS_LINK_RE =
  /<a\b[^>]*\bclass=["'][^"']*\b(?:o)?keyword\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

const HATENA_KEYWORD_HREF_RE =
  /<a\b[^>]*\bhref=["']https?:\/\/[^"']*hatena\.ne\.jp\/keyword\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

const MOHICAN_KEYWORD_HREF_RE =
  /<a\b[^>]*\bhref=["']g:mohican:keyword:[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

function stripAnchorWrappers(html: string, re: RegExp): string {
  return html.replace(re, (_, inner: string) => inner);
}

/** Normalize legacy はてな keyword links in imported HTML bodies. */
export function normalizeHatenaKeywordLinks(html: string): string {
  let out = html;
  out = stripAnchorWrappers(out, KEYWORD_CLASS_LINK_RE);
  out = stripAnchorWrappers(out, HATENA_KEYWORD_HREF_RE);
  out = stripAnchorWrappers(out, MOHICAN_KEYWORD_HREF_RE);
  return out;
}