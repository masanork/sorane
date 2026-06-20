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
  readonly aiLabeledCount?: number;
  readonly diagramsEnabled?: boolean;
}

export interface FeedEntry {
  readonly title: string;
  readonly url: string;
  readonly id: string;
  readonly updated: string;
  readonly summary?: string;
  readonly digitalSourceCode?: string;
}

export function buildAtomFeed(
  entries: readonly FeedEntry[],
  opts: { siteTitle: string; siteDescription: string; baseUrl: string; feedPath?: string },
): string {
  const feedUrl =
    opts.baseUrl.length > 0
      ? `${opts.baseUrl}/${opts.feedPath ?? "feed.xml"}`
      : opts.feedPath ?? "feed.xml";
  const updated =
    entries.length > 0
      ? entries[0]!.updated
      : new Date().toISOString();
  const items = entries
    .map((e) => {
      const summary = e.summary
        ? `<summary>${escapeXml(e.summary)}</summary>`
        : "";
      const category = e.digitalSourceCode
        ? `    <category term="ai-disclosure:${escapeXml(e.digitalSourceCode)}" scheme="http://cv.iptc.org/newscodes/digitalsourcetype" />\n`
        : "";
      return (
        `  <entry>\n` +
        `    <title>${escapeXml(e.title)}</title>\n` +
        `    <link href="${escapeXml(e.url)}" />\n` +
        `    <id>${escapeXml(e.id)}</id>\n` +
        `    <updated>${escapeXml(e.updated)}</updated>\n` +
        `${category}` +
        `${summary}\n` +
        `  </entry>`
      );
    })
    .join("\n");
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<feed xmlns="http://www.w3.org/2005/Atom">\n' +
    `  <title>${escapeXml(opts.siteTitle)}</title>\n` +
    `  <subtitle>${escapeXml(opts.siteDescription)}</subtitle>\n` +
    `  <link href="${escapeXml(feedUrl)}" rel="self" />\n` +
    `  <link href="${escapeXml(opts.baseUrl.length > 0 ? opts.baseUrl + "/" : "")}" />\n` +
    `  <updated>${escapeXml(updated)}</updated>\n` +
    `  <id>${escapeXml(feedUrl)}</id>\n` +
    `${items}\n` +
    `</feed>\n`
  );
}

export function buildLlmsTxt(opts: LlmsTxtOptions): string {
  const abs = (u: string) =>
    /^https?:/.test(u) || opts.baseUrl.length === 0 ? u : `${opts.baseUrl}/${u}`;
  const lines = [
    `# ${opts.siteTitle}`,
    "",
    `> ${opts.siteDescription}`,
    "",
    "## Machine-readable",
    "",
    `- [OKF bundle](${abs("okf/bundle.tar.gz")}): all concepts as {type}/{slug}.md`,
    `- [DCAT catalog](${abs("catalog.jsonld")})`,
    `- [Sitemap](${abs("sitemap.xml")})`,
  ];
  if (opts.diagramsEnabled) {
    lines.push(
      "",
      "Diagram fences (` ```mermaid `, ` ```d2 `) in page bodies are preserved verbatim in sibling `.md` alternates and the OKF bundle.",
      "HTML pages may load client-side Mermaid (`assets/diagrams/sorane-mermaid-loader.mjs`) when fences are present.",
    );
  }
  if (opts.aiLabeledCount !== undefined && opts.aiLabeledCount > 0) {
    lines.push(
      "",
      "## AI content disclosure",
      "",
      "Articles may declare `digitalSourceType` (IPTC NewsCodes / schema.org) in OKF frontmatter.",
      "Published HTML includes JSON-LD `digitalSourceType` and optional EU transparency badges.",
      "Search index (`assets/search-index.json`) exposes `digital_source_type` per chunk when set.",
      "Atom feed (`feed.xml`) includes `category term` when disclosure is present.",
      "",
      `Labeled articles: ${opts.aiLabeledCount}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}