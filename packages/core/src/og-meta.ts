/** site.og_image / frontmatter og_image を絶対 URL に解決する。base_url 無しの相対パスは undefined。 */
export function resolveOgImageUrl(baseUrl: string, image?: string): string | undefined {
  if (image === undefined || image.trim().length === 0) return undefined;
  const trimmed = image.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = baseUrl.replace(/\/$/, "");
  if (base.length === 0) return undefined;
  if (trimmed.startsWith("/")) return `${base}${trimmed}`;
  return `${base}/${trimmed}`;
}

/** BCP 47 lang を Open Graph locale にざっくり変換する。 */
export function ogLocaleFromLang(lang: string): string {
  const primary = lang.split("-")[0]?.toLowerCase() ?? "ja";
  if (primary === "ja") return "ja_JP";
  if (primary === "en") return "en_US";
  return lang.replace("-", "_");
}