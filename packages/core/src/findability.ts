import type { SoraneConfig } from "./config.ts";

export type OrganizationKind = "Organization" | "GovernmentOrganization";

export interface SiteOrganizationConfig {
  readonly name: string;
  readonly url?: string;
  readonly type?: OrganizationKind;
  readonly same_as?: readonly string[];
}

export interface SiteContactConfig {
  /** dist 基準の問い合わせページ（例: contact.html） */
  readonly page?: string;
  readonly email?: string;
}

export interface SiteFindabilityConfig {
  /** ページ JSON-LD に BreadcrumbList を付与（既定: true） */
  readonly breadcrumbs?: boolean;
  /** WebSite JSON-LD に SearchAction を付与（検索ページがあるとき、既定: true） */
  readonly search_action?: boolean;
  /** robots.txt の Disallow パス（先頭 / 推奨） */
  readonly disallow?: readonly string[];
}

export interface OrganizationSpec {
  readonly name: string;
  readonly url?: string;
  readonly type: OrganizationKind;
  readonly sameAs?: readonly string[];
}

export function organizationFromSite(
  site: SoraneConfig["site"],
): OrganizationSpec | undefined {
  const org = site.organization;
  if (!org?.name) return undefined;
  return {
    name: org.name,
    url: org.url,
    type: org.type ?? "GovernmentOrganization",
    sameAs: org.same_as,
  };
}

export function findabilityFlags(
  site: SoraneConfig["site"],
): { breadcrumbs: boolean; searchAction: boolean; disallow: readonly string[] } {
  const f = site.findability;
  return {
    breadcrumbs: f?.breadcrumbs !== false,
    searchAction: f?.search_action !== false,
    disallow: f?.disallow ?? [],
  };
}

export function buildOrganizationNode(org: OrganizationSpec): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": org.type,
    name: org.name,
  };
  if (org.url) node.url = org.url;
  if (org.sameAs && org.sameAs.length > 0) node.sameAs = [...org.sameAs];
  return node;
}

/** ISO 日付（YYYY-MM-DD）に正規化し、updated と timestamp の新しい方を返す。 */
export function resolveSitemapLastmod(
  timestamp?: string,
  updated?: string,
): string | undefined {
  const norm = (s: string | undefined): string | undefined => {
    if (!s || s.length < 10) return undefined;
    return s.slice(0, 10);
  };
  const a = norm(updated);
  const b = norm(timestamp);
  if (a && b) return a >= b ? a : b;
  return a ?? b;
}

export function creativeWorkFindabilityFields(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const id = frontmatter.identifier;
  if (typeof id === "string" && id.length > 0) {
    out.identifier = id;
  }
  const subject = frontmatter.subject;
  if (typeof subject === "string" && subject.length > 0) {
    out.about = { "@type": "Thing", name: subject };
  }
  const audience = frontmatter.audience;
  if (typeof audience === "string" && audience.length > 0) {
    out.audience = { "@type": "Audience", audienceType: audience };
  }
  const coverage = frontmatter.coverage;
  if (typeof coverage === "string" && coverage.length > 0) {
    out.spatialCoverage = coverage;
  }
  return out;
}

export function buildWebSiteJsonLd(opts: {
  readonly title: string;
  readonly description?: string;
  readonly url?: string;
  readonly lang: string;
  readonly organization?: OrganizationSpec;
  readonly searchUrl?: string;
}): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: opts.title,
    inLanguage: opts.lang,
  };
  if (opts.description) data.description = opts.description;
  if (opts.url) data.url = opts.url;
  if (opts.organization) {
    data.publisher = buildOrganizationNode(opts.organization);
  }
  if (opts.searchUrl) {
    const template = opts.searchUrl.includes("?")
      ? `${opts.searchUrl}&q={search_term_string}`
      : `${opts.searchUrl}?q={search_term_string}`;
    data.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: template,
      },
      "query-input": "required name=search_term_string",
    };
  }
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function buildBreadcrumbJsonLd(opts: {
  readonly items: readonly { readonly name: string; readonly url: string }[];
}): string {
  if (opts.items.length === 0) return "";
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: opts.items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function breadcrumbItemsForPage(opts: {
  readonly baseUrl: string;
  readonly homeTitle: string;
  readonly pageTitle: string;
  readonly pageUrl: string;
}): { name: string; url: string }[] {
  const abs = (path: string) =>
    opts.baseUrl.length > 0
      ? `${opts.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
      : path;
  return [
    { name: opts.homeTitle, url: abs("index.html") },
    { name: opts.pageTitle, url: opts.pageUrl },
  ];
}

export interface LlmsContactOptions {
  readonly contact?: SiteContactConfig;
  readonly organization?: OrganizationSpec;
  readonly baseUrl: string;
}

export function llmsContactSection(opts: LlmsContactOptions): string[] {
  const lines: string[] = [];
  const abs = (u: string) =>
    /^https?:/.test(u) || opts.baseUrl.length === 0 ? u : `${opts.baseUrl}/${u}`;
  if (opts.organization) {
    lines.push("", "## Publisher", "", `- ${opts.organization.name} (${opts.organization.type})`);
    if (opts.organization.url) lines.push(`- ${opts.organization.url}`);
  }
  const c = opts.contact;
  if (c?.page || c?.email) {
    lines.push("", "## Contact", "");
    if (c.page) lines.push(`- [Contact](${abs(c.page)})`);
    if (c.email) lines.push(`- ${c.email}`);
  }
  return lines;
}