import { dirname, relative } from "node:path";
import type { OkfConcept } from "@sorane/okf";
import type { AiDisclosure } from "./ai-disclosure.ts";
import { aiDisclosureJsonLdFields, buildCompactAiBadgeHtml } from "./ai-disclosure.ts";
import {
  buildOrganizationNode,
  creativeWorkFindabilityFields,
  type OrganizationSpec,
} from "./findability.ts";
import {
  associatedMediaJsonLdFields,
  type AssociatedMediaItem,
} from "./associated-media.ts";
import type { DiagramsConfig } from "./config.ts";
import {
  renderBodySection,
  renderBodySectionForConfig,
  type BodySectionOptions,
} from "./diagrams/render-body-section.ts";
import type { DiagramRenderMeta } from "./diagrams/diagram-meta.ts";
import { searchFacetOptionsHtml } from "./search-facets.ts";
import { escapeHtml, stripDuplicateTitleHeading } from "./render.ts";
import { ogLocaleFromLang } from "./og-meta.ts";
import { siteLabels, type SiteLabels } from "./site-labels.ts";
import {
  parseRevisionHistory,
  revisionHistoryHtml,
} from "./revision-history.ts";

export function extractDescription(body: string, maxLen = 200): string | null {
  const lines = body.split(/\r?\n/);
  const para: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.length === 0) {
      if (para.length > 0) break;
      continue;
    }
    if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|\||={3,}|-{3,}|<)/.test(line)) {
      if (para.length > 0) break;
      continue;
    }
    para.push(line);
  }
  if (para.length === 0) return null;
  let text = para
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

/** リスト用 description の HTML タグ・エスケープ残骸を除去する。 */
export function sanitizeListDescription(text: string, maxLen = 200): string {
  let t = text
    .replace(/\\</g, "<")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export function renderFeaturedExcerpt(
  concept: OkfConcept,
  excerptLength: number,
): string {
  const text =
    concept.description ??
    extractDescription(concept.body, excerptLength) ??
    extractDescription(concept.body);
  if (!text) return "";
  return `<p>${escapeHtml(text)}</p>`;
}

export { buildWebSiteJsonLd } from "./findability.ts";
export type { OrganizationSpec } from "./findability.ts";

export interface PageShellOptions {
  readonly title: string;
  readonly siteTitle: string;
  readonly bodyHtml: string;
  readonly rootPrefix: string;
  readonly description?: string;
  readonly canonicalUrl?: string;
  readonly machineSources?: ReadonlyArray<{ href: string; type: string }>;
  readonly lang?: string;
  readonly hreflangAlternates?: ReadonlyArray<{ readonly hreflang: string; readonly href: string }>;
  readonly ogLocaleAlternates?: readonly string[];
  readonly extraHead?: ReadonlyArray<string>;
  readonly feedPath?: string;
  readonly showArchiveNav?: boolean;
  readonly searchPath?: string;
  readonly pageKind?: "website" | "article";
  readonly docsLayout?: boolean;
  readonly docsSidebarHtml?: string;
  readonly headerSearchHtml?: string;
  readonly ogImageUrl?: string;
  readonly emergencyBannerHtml?: string;
}

export interface ArticleListEntry {
  readonly title: string;
  readonly href: string;
  readonly timestamp?: string;
  readonly updated?: string;
  readonly author?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly aiDisclosure?: AiDisclosure;
}

export interface ArticleNav {
  readonly prev?: { href: string; title: string };
  readonly next?: { href: string; title: string };
}

export interface BlogIndexOptions {
  readonly siteTitle: string;
  readonly description?: string;
  /** false のとき blog-header の h1 を出さない（site-header と重複させない） */
  readonly showHeaderTitle?: boolean;
  readonly profileUrl?: string;
  readonly githubUrl?: string;
  readonly introHtml?: string;
  readonly latestArticle?: {
    readonly title: string;
    readonly href: string;
    readonly timestamp?: string;
    readonly updated?: string;
    readonly author?: string;
    readonly bodyHtml: string;
    readonly aiDisclosure?: AiDisclosure;
  };
  readonly articles: readonly ArticleListEntry[];
  readonly archiveLimit?: number;
  readonly showListDescriptions?: boolean;
  readonly lang?: string;
  readonly labels?: SiteLabels;
  readonly showOnLists?: boolean;
  readonly listRootPrefix?: string;
  /** トップのアーカイブ欄から続きの一覧へ（例: page/2.html） */
  readonly moreArticlesHref?: string;
  /** 年別アーカイブ index への相対 URL */
  readonly yearArchiveHref?: string;
}

export function buildPage(opts: PageShellOptions): string {
  const titleEsc = escapeHtml(opts.title);
  const head: string[] = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${titleEsc}</title>`,
  ];
  if (opts.description) {
    const d = escapeHtml(opts.description);
    head.push(`<meta name="description" content="${d}">`);
    head.push(`<meta property="og:description" content="${d}">`);
  }
  const ogType = opts.pageKind === "website" ? "website" : "article";
  head.push(
    `<meta property="og:title" content="${titleEsc}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="${escapeHtml(opts.siteTitle)}">`,
    `<link rel="stylesheet" href="${opts.rootPrefix}assets/main.css">`,
    `<link rel="alternate" type="application/ld+json" href="${opts.rootPrefix}catalog.jsonld">`,
    `<link rel="help" type="text/plain" href="${opts.rootPrefix}llms.txt">`,
  );
  if (opts.canonicalUrl) {
    const u = escapeHtml(opts.canonicalUrl);
    head.push(`<link rel="canonical" href="${u}">`);
    head.push(`<meta property="og:url" content="${u}">`);
  }
  const lang = opts.lang ?? "ja";
  head.push(`<meta property="og:locale" content="${escapeHtml(ogLocaleFromLang(lang))}">`);
  if (opts.ogLocaleAlternates) {
    for (const alt of opts.ogLocaleAlternates) {
      head.push(
        `<meta property="og:locale:alternate" content="${escapeHtml(alt)}">`,
      );
    }
  }
  if (opts.hreflangAlternates) {
    for (const alt of opts.hreflangAlternates) {
      head.push(
        `<link rel="alternate" hreflang="${escapeHtml(alt.hreflang)}" href="${escapeHtml(alt.href)}">`,
      );
    }
  }
  if (opts.ogImageUrl) {
    const img = escapeHtml(opts.ogImageUrl);
    head.push(`<meta property="og:image" content="${img}">`);
    head.push(`<meta name="twitter:card" content="summary_large_image">`);
    head.push(`<meta name="twitter:image" content="${img}">`);
  } else {
    head.push(`<meta name="twitter:card" content="summary">`);
  }
  head.push(`<meta name="twitter:title" content="${titleEsc}">`);
  if (opts.description) {
    head.push(`<meta name="twitter:description" content="${escapeHtml(opts.description)}">`);
  }
  if (opts.machineSources) {
    for (const s of opts.machineSources) {
      head.push(
        `<link rel="alternate" type="${escapeHtml(s.type)}" href="${escapeHtml(s.href)}">`,
      );
    }
  }
  if (opts.feedPath) {
    head.push(
      `<link rel="alternate" type="application/atom+xml" title="${escapeHtml(opts.siteTitle)}" href="${escapeHtml(opts.rootPrefix + opts.feedPath)}">`,
    );
  }
  if (opts.extraHead) head.push(...opts.extraHead);
  const labels = siteLabels(lang);
  const home = `${opts.rootPrefix}index.html`;
  const navParts: string[] = [];
  if (opts.showArchiveNav) {
    navParts.push(
      `<a href="${escapeHtml(`${opts.rootPrefix}archive/index.html`)}">${escapeHtml(labels.yearArchive)}</a>`,
    );
  }
  if (opts.searchPath) {
    navParts.push(
      `<a href="${escapeHtml(opts.rootPrefix + opts.searchPath)}">${escapeHtml(labels.search)}</a>`,
    );
  }
  const nav =
    navParts.length > 0
      ? `<nav class="site-nav" aria-label="サイト">${navParts.join("")}</nav>`
      : "";
  const headerEnd =
    opts.headerSearchHtml || nav
      ? `<div class="site-header-end">\n${opts.headerSearchHtml ?? ""}${nav}\n</div>\n`
      : "";
  const skipLink =
    `<a href="#main" class="skip-link">${escapeHtml(labels.skipToContent)}</a>\n`;
  const bodyClass = opts.docsLayout ? ' class="docs-site"' : "";
  let mainBlock = `<main id="main">\n${opts.bodyHtml}\n</main>\n`;
  if (opts.docsLayout && opts.docsSidebarHtml) {
    mainBlock =
      `<div class="docs-layout">\n` +
      `<aside class="docs-sidebar">\n` +
      `<details class="docs-nav-toggle">\n` +
      `<summary>${escapeHtml(labels.docsMenu)}</summary>\n` +
      `${opts.docsSidebarHtml}` +
      `</details>\n` +
      `<div class="docs-sidebar-desktop">\n${opts.docsSidebarHtml}</div>\n` +
      `</aside>\n` +
      `<main id="main" class="docs-main">\n${opts.bodyHtml}\n</main>\n` +
      `</div>\n`;
  }
  const emergencyBlock = opts.emergencyBannerHtml
    ? `${opts.emergencyBannerHtml}\n`
    : "";
  return (
    "<!doctype html>\n" +
    `<html lang="${escapeHtml(lang)}">\n` +
    `<head>\n${head.join("\n")}\n</head>\n` +
    `<body${bodyClass}>\n` +
    `${skipLink}` +
    `${emergencyBlock}` +
    `<header class="site-header">\n` +
    `<a class="site-title" href="${escapeHtml(home)}">${escapeHtml(opts.siteTitle)}</a>\n` +
    `${headerEnd}` +
    `</header>\n` +
    `${mainBlock}` +
    `<footer class="site-footer"><p><a href="${escapeHtml(home)}">${escapeHtml(opts.siteTitle)}</a></p></footer>\n` +
    "</body>\n</html>\n"
  );
}

function formatDate(iso?: string): string | undefined {
  return iso?.slice(0, 10);
}

function articleMetaHtml(opts: {
  timestamp?: string;
  updated?: string;
  author?: string;
}): string {
  const parts: string[] = [];
  const date = formatDate(opts.timestamp);
  if (date) {
    parts.push(`<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>`);
  }
  const updated = formatDate(opts.updated);
  if (updated && updated !== date) {
    parts.push(
      `<span class="article-updated">更新 <time datetime="${escapeHtml(updated)}">${escapeHtml(updated)}</time></span>`,
    );
  }
  if (opts.author) {
    parts.push(`<span class="article-author">${escapeHtml(opts.author)}</span>`);
  }
  if (parts.length === 0) return "";
  return `<p class="article-meta">${parts.join(" · ")}</p>`;
}

export function slugifyTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff-]/gi, "");
}

function tagsHtml(tags: readonly string[] | undefined): string {
  if (!tags || tags.length === 0) return "";
  const items = tags
    .map((t) => {
      const slug = slugifyTag(t);
      return slug
        ? `<a class="article-tag" href="tag/${escapeHtml(slug)}.html">${escapeHtml(t)}</a>`
        : "";
    })
    .filter(Boolean)
    .join(" ");
  if (!items) return "";
  return `<p class="article-tags">${items}</p>`;
}

function articleNavHtml(nav?: ArticleNav): string {
  if (!nav?.prev && !nav?.next) return "";
  const parts: string[] = [];
  if (nav.prev) {
    parts.push(
      `<span class="article-nav-prev"><a href="${escapeHtml(nav.prev.href)}">← ${escapeHtml(nav.prev.title)}</a></span>`,
    );
  }
  if (nav.next) {
    parts.push(
      `<span class="article-nav-next"><a href="${escapeHtml(nav.next.href)}">${escapeHtml(nav.next.title)} →</a></span>`,
    );
  }
  return `<nav class="article-nav" aria-label="記事">${parts.join(" · ")}</nav>`;
}

export type PageCreativeWorkType =
  | "BlogPosting"
  | "TechArticle"
  | "FAQPage"
  | "DefinedTermSet";

export function buildCreativeWorkJsonLd(opts: {
  workType: PageCreativeWorkType;
  title: string;
  description?: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  siteTitle: string;
  lang: string;
  aiDisclosure?: AiDisclosure;
  associatedMedia?: readonly AssociatedMediaItem[];
  organization?: OrganizationSpec;
  frontmatter?: Record<string, unknown>;
}): string {
  const isPartOf =
    opts.workType === "BlogPosting"
      ? { "@type": "Blog", name: opts.siteTitle }
      : { "@type": "WebSite", name: opts.siteTitle };

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": opts.workType,
    headline: opts.title,
    name: opts.title,
    url: opts.url,
    inLanguage: opts.lang,
    isPartOf,
  };
  if (opts.description) data.description = opts.description;
  if (opts.datePublished) data.datePublished = opts.datePublished;
  if (opts.dateModified) data.dateModified = opts.dateModified;
  if (opts.author) {
    data.author = { "@type": "Person", name: opts.author };
  }
  if (opts.organization) {
    data.publisher = buildOrganizationNode(opts.organization);
  }
  if (opts.frontmatter) {
    Object.assign(data, creativeWorkFindabilityFields(opts.frontmatter));
  }
  if (opts.aiDisclosure) {
    Object.assign(data, aiDisclosureJsonLdFields(opts.aiDisclosure));
  }
  const mediaFields = associatedMediaJsonLdFields(opts.associatedMedia ?? []);
  if (mediaFields) Object.assign(data, mediaFields);
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/** @deprecated Use buildCreativeWorkJsonLd({ workType: "BlogPosting", ... }) */
export function buildBlogPostingJsonLd(opts: {
  title: string;
  description?: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  siteTitle: string;
  lang: string;
  aiDisclosure?: AiDisclosure;
  associatedMedia?: readonly AssociatedMediaItem[];
}): string {
  return buildCreativeWorkJsonLd({ ...opts, workType: "BlogPosting" });
}

const SERIF_FONT_STYLES = new Set(["GJM", "serif", "mincho"]);

/** frontmatter の font スタイルが明朝指定なら class を返す。 */
export function articleFontClass(concept: OkfConcept): string {
  const font = concept.frontmatter.font;
  if (typeof font !== "string") return "";
  return SERIF_FONT_STYLES.has(font) ? " font-serif" : "";
}

export interface ArticleBodyResult {
  readonly bodyHtml: string;
  readonly diagrams: DiagramRenderMeta;
}

function articleRevisionBlock(concept: OkfConcept, lang: string): string {
  const revisions = parseRevisionHistory(concept.frontmatter);
  return revisionHistoryHtml(revisions, lang);
}

export function renderArticleBodyWithMeta(
  concept: OkfConcept,
  nav?: ArticleNav,
  opts?: {
    readonly badgeHtml?: string;
    readonly lang?: string;
    readonly diagrams?: DiagramsConfig;
  } & BodySectionOptions,
): ArticleBodyResult {
  const updated =
    typeof concept.frontmatter.updated === "string"
      ? concept.frontmatter.updated
      : typeof concept.frontmatter.date === "string"
        ? concept.frontmatter.date
        : undefined;
  const author =
    typeof concept.frontmatter.author === "string" ? concept.frontmatter.author : undefined;
  const badge = opts?.badgeHtml ?? "";
  const section = renderBodySection(stripDuplicateTitleHeading(concept.body, concept.title), opts);
  const header = [
    "<header>",
    `<h1>${escapeHtml(concept.title)}</h1>`,
    articleMetaHtml({ timestamp: concept.timestamp, updated, author }),
    tagsHtml(concept.tags),
    badge,
    "</header>",
  ].join("\n");
  const lang = opts?.lang ?? "ja";
  const revisionBlock = articleRevisionBlock(concept, lang);
  const bodyHtml =
    `<article class="article-page${articleFontClass(concept)}">\n` +
    `${header}\n` +
    `<div class="article-body">\n${section.html}\n</div>\n` +
    `${revisionBlock}` +
    `${articleNavHtml(nav)}\n` +
    `</article>`;
  return { bodyHtml, diagrams: section.diagrams };
}

export async function renderArticleBodyWithMetaForConfig(
  concept: OkfConcept,
  nav?: ArticleNav,
  opts?: {
    readonly badgeHtml?: string;
    readonly lang?: string;
    readonly diagrams?: DiagramsConfig;
  } & BodySectionOptions,
): Promise<ArticleBodyResult> {
  const updated =
    typeof concept.frontmatter.updated === "string"
      ? concept.frontmatter.updated
      : typeof concept.frontmatter.date === "string"
        ? concept.frontmatter.date
        : undefined;
  const author =
    typeof concept.frontmatter.author === "string" ? concept.frontmatter.author : undefined;
  const badge = opts?.badgeHtml ?? "";
  const section = await renderBodySectionForConfig(
    stripDuplicateTitleHeading(concept.body, concept.title),
    opts,
  );
  const header = [
    "<header>",
    `<h1>${escapeHtml(concept.title)}</h1>`,
    articleMetaHtml({ timestamp: concept.timestamp, updated, author }),
    tagsHtml(concept.tags),
    badge,
    "</header>",
  ].join("\n");
  const lang = opts?.lang ?? "ja";
  const revisionBlock = articleRevisionBlock(concept, lang);
  const bodyHtml =
    `<article class="article-page${articleFontClass(concept)}">\n` +
    `${header}\n` +
    `<div class="article-body">\n${section.html}\n</div>\n` +
    `${revisionBlock}` +
    `${articleNavHtml(nav)}\n` +
    `</article>`;
  return { bodyHtml, diagrams: section.diagrams };
}

export function renderArticleBody(
  concept: OkfConcept,
  nav?: ArticleNav,
  opts?: { readonly badgeHtml?: string; readonly diagrams?: DiagramsConfig },
): string {
  return renderArticleBodyWithMeta(concept, nav, opts).bodyHtml;
}

export function renderBlogIndexBody(opts: BlogIndexOptions): string {
  const labels = opts.labels ?? siteLabels(opts.lang ?? "ja");
  const links = [
    opts.profileUrl
      ? `<a href="${escapeHtml(opts.profileUrl)}" class="blog-profile-link">${escapeHtml(labels.profile)}</a>`
      : "",
    opts.githubUrl
      ? `<a href="${escapeHtml(opts.githubUrl)}" class="blog-profile-link">${escapeHtml(labels.github)}</a>`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const profile = links ? links : "";
  const intro = opts.introHtml
    ? `<div class="blog-intro">${opts.introHtml}</div>`
    : "";

  const listPrefix = opts.listRootPrefix ?? "./";
  const compactBadge = (d?: AiDisclosure) =>
    opts.showOnLists && d?.showBadge
      ? buildCompactAiBadgeHtml(d, { rootPrefix: listPrefix })
      : "";

  let featured = "";
  if (opts.latestArticle) {
    const la = opts.latestArticle;
    const badge = compactBadge(la.aiDisclosure);
    featured =
      `<article class="blog-featured">\n` +
      `<header>\n` +
      `<h2><a href="${escapeHtml(la.href)}">${escapeHtml(la.title)}</a></h2>\n` +
      articleMetaHtml({
        timestamp: la.timestamp,
        updated: la.updated,
        author: la.author,
      }) +
      badge +
      `</header>\n` +
      `<div class="article-body">\n${la.bodyHtml}\n</div>\n` +
      `<p class="blog-permalink"><a href="${escapeHtml(la.href)}">${escapeHtml(labels.readMore)}</a></p>\n` +
      `</article>\n`;
  }

  const archive = opts.articles.slice(0, opts.archiveLimit ?? opts.articles.length);
  const items = archive
    .map((a) => {
      const date = formatDate(a.timestamp);
      const meta: string[] = [];
      if (date) meta.push(`<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>`);
      const updated = formatDate(a.updated);
      if (updated && updated !== date) {
        meta.push(
          `<span class="article-updated">${escapeHtml(labels.updated)} ${escapeHtml(updated)}</span>`,
        );
      }
      if (a.author) meta.push(`<span>${escapeHtml(a.author)}</span>`);
      if (opts.showListDescriptions && a.description) {
        meta.push(`<span class="blog-list-desc">${escapeHtml(a.description)}</span>`);
      }
      const badge = compactBadge(a.aiDisclosure);
      const metaHtml = meta.length > 0 ? `<div class="blog-list-meta">${meta.join(" · ")}</div>` : "";
      return (
        `<li class="blog-list-item">\n` +
        `<a href="${escapeHtml(a.href)}" class="blog-list-title">${escapeHtml(a.title)}</a>\n` +
        `${badge}` +
        `${metaHtml}\n` +
        `</li>`
      );
    })
    .join("\n");

  const archiveNavLinks: string[] = [];
  if (opts.moreArticlesHref) {
    archiveNavLinks.push(
      `<a href="${escapeHtml(opts.moreArticlesHref)}" class="blog-archive-more">${escapeHtml(labels.moreArticles)}</a>`,
    );
  }
  if (opts.yearArchiveHref) {
    archiveNavLinks.push(
      `<a href="${escapeHtml(opts.yearArchiveHref)}" class="blog-archive-by-year">${escapeHtml(labels.yearArchive)}</a>`,
    );
  }
  const archiveNav =
    archiveNavLinks.length > 0
      ? `<nav class="blog-archive-nav" aria-label="${escapeHtml(labels.pastArticles)}">${archiveNavLinks.join("")}</nav>\n`
      : "";

  const more =
    items.length > 0
      ? `<section class="blog-archive">\n<h2>${escapeHtml(labels.pastArticles)}</h2>\n<ul class="blog-list">\n${items}\n</ul>\n${archiveNav}</section>\n`
      : "";

  const showTitle = opts.showHeaderTitle !== false;
  return (
    `<div class="blog-index">\n` +
    `<header class="blog-header">\n` +
    (showTitle ? `<h1>${escapeHtml(opts.siteTitle)}</h1>\n` : "") +
    (opts.description ? `<p class="blog-lead">${escapeHtml(opts.description)}</p>\n` : "") +
    (profile ? `<div class="blog-profile">${profile}</div>\n` : "") +
    `${intro}` +
    `</header>\n` +
    `${featured}` +
    `${more}` +
    `</div>\n`
  );
}

export function isSearchView(frontmatter: Record<string, unknown>): boolean {
  return frontmatter.view === "search";
}

export type SearchMountMode = "fts" | "hybrid";
export type SearchMountVariant = "page" | "header";

export function buildSearchMount(
  rootPrefix: string,
  opts: {
    readonly assetBaseUrl?: string;
    readonly mode?: SearchMountMode;
    readonly variant?: SearchMountVariant;
    readonly lang?: string;
  } = {},
): string {
  const mode = opts.mode ?? "fts";
  const variant = opts.variant ?? "page";
  const facetOpts = searchFacetOptionsHtml(opts.lang ?? "ja");
  const indexUrl = `${rootPrefix}assets/search-index.json`;
  const hybridAttrs =
    mode === "hybrid"
      ? (() => {
          const assetBaseUrl = opts.assetBaseUrl ?? "";
          const modelBase =
            assetBaseUrl.length > 0 ? `${assetBaseUrl}models/` : `${rootPrefix}models/`;
          return (
            ` data-mode="hybrid"` +
            ` data-model-base="${escapeHtml(modelBase)}"` +
            ` data-lib-base="${escapeHtml(rootPrefix)}assets/search/lib/"`
          );
        })()
      : ` data-mode="fts"`;
  const searchClass = variant === "header" ? "search search--header" : "search";
  const form =
    variant === "header"
      ? `<form class="search-form" role="search">` +
        `<input type="search" name="q" class="search-input" placeholder="検索" autocomplete="off" aria-label="検索">` +
        `<button type="submit" class="search-submit" aria-label="検索">検索</button>` +
        `</form>`
      : `<form class="search-form" role="search">` +
        `<input type="search" name="q" class="search-input" placeholder="キーワードで検索" autocomplete="off" aria-label="検索キーワード">` +
        `<select name="type" class="search-facet" aria-label="種別で絞り込み">${facetOpts}</select>` +
        `<button type="submit" class="search-submit">検索</button>` +
        `</form>`;
  const status =
    variant === "header"
      ? `<p class="search-status search-status--sr" data-search-status aria-live="polite" aria-atomic="true"></p>`
      : `<p class="search-status" data-search-status aria-live="polite" aria-atomic="true"></p>`;
  return (
    `<div class="${searchClass}" data-search data-index="${escapeHtml(indexUrl)}"${hybridAttrs}>` +
    `${form}` +
    `${status}` +
    `<ol class="search-results" data-search-results role="list" aria-live="polite" aria-relevant="additions"></ol>` +
    `</div>\n`
  );
}

export function buildSearchHead(rootPrefix: string, mode: SearchMountMode = "fts"): string[] {
  if (mode === "fts") {
    return [`<script type="module" src="${rootPrefix}assets/search.mjs"></script>`];
  }
  const libBase = `${rootPrefix || "./"}assets/search/lib/`;
  return [
    `<script type="importmap">${JSON.stringify({
      imports: {
        "onnxruntime-web/webgpu": `${libBase}ort.webgpu.bundle.min.mjs`,
        "onnxruntime-common": `${libBase}ort.webgpu.bundle.min.mjs`,
      },
    })}</script>`,
    `<script type="module" src="${rootPrefix}assets/search.mjs"></script>`,
  ];
}

/** シンプルな index（examples 向け）。blog サイトは renderBlogIndexBody を使う。 */
export function renderIndexBody(
  siteTitle: string,
  articles: ReadonlyArray<{ title: string; href: string; timestamp?: string }>,
): string {
  return renderBlogIndexBody({
    siteTitle,
    articles,
    archiveLimit: articles.length,
  });
}

/** content ルートからの相対パスに対する dist ルートからの rootPrefix を計算する。 */
export function rootPrefixFromRel(relPath: string): string {
  const depth = relPath.replace(/\\/g, "/").split("/").length - 1;
  return depth > 0 ? "../".repeat(depth) : "./";
}

/** dist ルート基準のパス同士から、from ページ向けの相対リンクを作る。 */
export function relLinkFrom(fromRel: string, toRel: string): string {
  const from = fromRel.replace(/\\/g, "/");
  const to = toRel.replace(/\\/g, "/");
  const rel = relative(dirname(from), to).split("\\").join("/");
  return rel.length > 0 ? rel : "./";
}