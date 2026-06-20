import type { OkfConcept } from "@sorane/okf";
import { escapeHtml, renderMarkdown } from "./render.ts";

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

export interface PageShellOptions {
  readonly title: string;
  readonly siteTitle: string;
  readonly bodyHtml: string;
  readonly rootPrefix: string;
  readonly description?: string;
  readonly canonicalUrl?: string;
  readonly machineSources?: ReadonlyArray<{ href: string; type: string }>;
  readonly lang?: string;
  readonly extraHead?: ReadonlyArray<string>;
  readonly feedPath?: string;
  readonly showArchiveNav?: boolean;
}

export interface ArticleListEntry {
  readonly title: string;
  readonly href: string;
  readonly timestamp?: string;
  readonly updated?: string;
  readonly author?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface ArticleNav {
  readonly prev?: { href: string; title: string };
  readonly next?: { href: string; title: string };
}

export interface BlogIndexOptions {
  readonly siteTitle: string;
  readonly description?: string;
  readonly profileUrl?: string;
  readonly introHtml?: string;
  readonly latestArticle?: {
    readonly title: string;
    readonly href: string;
    readonly timestamp?: string;
    readonly updated?: string;
    readonly author?: string;
    readonly bodyHtml: string;
  };
  readonly articles: readonly ArticleListEntry[];
  readonly archiveLimit?: number;
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
  head.push(
    `<meta property="og:title" content="${titleEsc}">`,
    `<meta property="og:type" content="article">`,
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
  const lang = opts.lang ?? "ja";
  const home = `${opts.rootPrefix}index.html`;
  const feed = opts.feedPath ? `${opts.rootPrefix}${opts.feedPath}` : undefined;
  const navParts: string[] = [];
  if (opts.showArchiveNav) {
    navParts.push(`<a href="${escapeHtml(`${opts.rootPrefix}archive/index.html`)}">Archive</a>`);
  }
  if (feed) navParts.push(`<a href="${escapeHtml(feed)}">Feed</a>`);
  const nav =
    navParts.length > 0
      ? `<nav class="site-nav" aria-label="サイト">${navParts.join("")}</nav>`
      : "";
  return (
    "<!doctype html>\n" +
    `<html lang="${escapeHtml(lang)}">\n` +
    `<head>\n${head.join("\n")}\n</head>\n` +
    "<body>\n" +
    `<header class="site-header">\n` +
    `<a class="site-title" href="${escapeHtml(home)}">${escapeHtml(opts.siteTitle)}</a>\n` +
    `${nav}\n` +
    `</header>\n` +
    `<main>\n${opts.bodyHtml}\n</main>\n` +
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

export function buildBlogPostingJsonLd(opts: {
  title: string;
  description?: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  siteTitle: string;
  lang: string;
}): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.title,
    url: opts.url,
    inLanguage: opts.lang,
    isPartOf: { "@type": "Blog", name: opts.siteTitle },
  };
  if (opts.description) data.description = opts.description;
  if (opts.datePublished) data.datePublished = opts.datePublished;
  if (opts.dateModified) data.dateModified = opts.dateModified;
  if (opts.author) {
    data.author = { "@type": "Person", name: opts.author };
  }
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function renderArticleBody(concept: OkfConcept, nav?: ArticleNav): string {
  const updated =
    typeof concept.frontmatter.updated === "string"
      ? concept.frontmatter.updated
      : typeof concept.frontmatter.date === "string"
        ? concept.frontmatter.date
        : undefined;
  const author =
    typeof concept.frontmatter.author === "string" ? concept.frontmatter.author : undefined;
  const header = [
    "<header>",
    `<h1>${escapeHtml(concept.title)}</h1>`,
    articleMetaHtml({ timestamp: concept.timestamp, updated, author }),
    tagsHtml(concept.tags),
    "</header>",
  ].join("\n");
  return (
    `<article class="article-page">\n` +
    `${header}\n` +
    `<div class="article-body">\n${renderMarkdown(concept.body)}\n</div>\n` +
    `${articleNavHtml(nav)}\n` +
    `</article>`
  );
}

export function renderBlogIndexBody(opts: BlogIndexOptions): string {
  const profile = opts.profileUrl
    ? `<a href="${escapeHtml(opts.profileUrl)}" class="blog-profile-link">Profile</a>`
    : "";
  const intro = opts.introHtml
    ? `<div class="blog-intro">${opts.introHtml}</div>`
    : "";

  let featured = "";
  if (opts.latestArticle) {
    const la = opts.latestArticle;
    featured =
      `<article class="blog-featured">\n` +
      `<header>\n` +
      `<h2><a href="${escapeHtml(la.href)}">${escapeHtml(la.title)}</a></h2>\n` +
      articleMetaHtml({
        timestamp: la.timestamp,
        updated: la.updated,
        author: la.author,
      }) +
      `</header>\n` +
      `<div class="article-body">\n${la.bodyHtml}\n</div>\n` +
      `<p class="blog-permalink"><a href="${escapeHtml(la.href)}">Permalink →</a></p>\n` +
      `</article>\n`;
  }

  const archive = opts.articles.slice(0, opts.archiveLimit ?? opts.articles.length);
  const items = archive
    .map((a) => {
      const date = formatDate(a.timestamp);
      const meta: string[] = [];
      if (date) meta.push(`<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>`);
      const updated = formatDate(a.updated);
      if (updated && updated !== date) meta.push(`<span class="article-updated">更 ${escapeHtml(updated)}</span>`);
      if (a.author) meta.push(`<span>${escapeHtml(a.author)}</span>`);
      if (a.description) meta.push(`<span class="blog-list-desc">${escapeHtml(a.description)}</span>`);
      const metaHtml = meta.length > 0 ? `<div class="blog-list-meta">${meta.join(" · ")}</div>` : "";
      return (
        `<li class="blog-list-item">\n` +
        `<a href="${escapeHtml(a.href)}" class="blog-list-title">${escapeHtml(a.title)}</a>\n` +
        `${metaHtml}\n` +
        `</li>`
      );
    })
    .join("\n");

  const more =
    items.length > 0
      ? `<section class="blog-archive">\n<h2>過去の記事</h2>\n<ul class="blog-list">\n${items}\n</ul>\n</section>\n`
      : "";

  return (
    `<div class="blog-index">\n` +
    `<header class="blog-header">\n` +
    `<h1>${escapeHtml(opts.siteTitle)}</h1>\n` +
    (opts.description ? `<p class="blog-lead">${escapeHtml(opts.description)}</p>\n` : "") +
    (profile ? `<div class="blog-profile">${profile}</div>\n` : "") +
    `${intro}` +
    `</header>\n` +
    `${featured}` +
    `${more}` +
    `</div>\n`
  );
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