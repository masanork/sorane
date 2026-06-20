export interface SiteEntry {
  readonly url: string;
  readonly lastmod?: string;
  readonly isIndex: boolean;
}

export function buildRobotsTxt(baseUrl: string): string {
  const lines = ["User-agent: *", "Allow: /"];
  if (baseUrl.length > 0) lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
  return lines.join("\n") + "\n";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSitemapXml(entries: readonly SiteEntry[], baseUrl: string): string {
  const abs = (u: string) => (baseUrl.length > 0 ? `${baseUrl}/${u}` : u);
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${escapeXml(abs(e.url))}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
      parts.push(`    <priority>${e.isIndex ? "0.8" : "0.5"}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    "\n</urlset>\n"
  );
}

export interface LlmsTxtOptions {
  readonly siteTitle: string;
  readonly siteDescription: string;
  readonly baseUrl: string;
}

export function buildLlmsTxt(opts: LlmsTxtOptions): string {
  const abs = (u: string) =>
    /^https?:/.test(u) || opts.baseUrl.length === 0 ? u : `${opts.baseUrl}/${u}`;
  return [
    `# ${opts.siteTitle}`,
    "",
    `> ${opts.siteDescription}`,
    "",
    "## Machine-readable",
    "",
    `- [OKF bundle](${abs("okf/bundle.tar.gz")}): all concepts as {type}/{slug}.md`,
    `- [DCAT catalog](${abs("catalog.jsonld")})`,
    `- [Sitemap](${abs("sitemap.xml")})`,
    "",
  ].join("\n");
}