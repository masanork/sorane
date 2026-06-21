import type { OkfConcept } from "@sorane/okf";
import { dirname, relative } from "node:path";
import type { DiagramsConfig, DocsNavSpec } from "./config.ts";
import type { DiagramRenderMeta } from "./diagrams/diagram-meta.ts";
import {
  escapeHtml,
  stripDuplicateTitleHeading,
  type RenderedMarkdown,
  renderMarkdownDocument,
} from "./render.ts";
import { needsAsyncDiagramCompile } from "./diagrams/needs-async-compile.ts";
import {
  renderMarkdownDocumentAsync,
  type AsyncRenderOptions,
} from "./diagrams/render-async.ts";
import { siteLabels } from "./site-labels.ts";
import type { ArticleListEntry } from "./ssg.ts";
import {
  parseRevisionHistory,
  revisionHistoryHtml,
} from "./revision-history.ts";

export interface DocsArticleRenderOpts extends AsyncRenderOptions {
  readonly badgeHtml?: string;
  readonly relatedHtml?: string;
  readonly diagrams?: DiagramsConfig;
}

export interface DocsArticleResult {
  readonly bodyHtml: string;
  readonly diagrams: DiagramRenderMeta;
}

export interface ArticleNav {
  readonly prev?: { href: string; title: string };
  readonly next?: { href: string; title: string };
}

const SERIF_FONT_STYLES = new Set(["GJM", "serif", "mincho"]);

function articleFontClass(concept: OkfConcept): string {
  const font = concept.frontmatter.font;
  if (typeof font !== "string") return "";
  return SERIF_FONT_STYLES.has(font) ? " font-serif" : "";
}

function relLinkFrom(fromRel: string, toRel: string): string {
  const from = fromRel.replace(/\\/g, "/");
  const to = toRel.replace(/\\/g, "/");
  const rel = relative(dirname(from), to).split("\\").join("/");
  return rel.length > 0 ? rel : "./";
}

export interface DocsNavLink {
  readonly href: string;
  readonly title: string;
}

export interface DocsNavSection {
  readonly section: string;
}

export type DocsNavEntry = DocsNavLink | DocsNavSection;

/** @deprecated Use DocsNavLink */
export type DocsNavItem = DocsNavLink;

export function isDocsNavLink(entry: DocsNavEntry): entry is DocsNavLink {
  return "href" in entry;
}

export function docsNavLinks(entries: readonly DocsNavEntry[]): readonly DocsNavLink[] {
  return entries.filter(isDocsNavLink);
}

/** 同一 `docs.nav` セクション内の他ページ（現在地を除く）。 */
export function docsSectionPeers(
  href: string,
  nav: readonly DocsNavEntry[],
): readonly DocsNavLink[] {
  const sections: DocsNavLink[][] = [];
  let current: DocsNavLink[] = [];
  for (const entry of nav) {
    if (!isDocsNavLink(entry)) {
      if (current.length > 0) sections.push(current);
      current = [];
      continue;
    }
    current.push(entry);
  }
  if (current.length > 0) sections.push(current);
  for (const section of sections) {
    if (section.some((link) => link.href === href)) {
      return section.filter((link) => link.href !== href);
    }
  }
  return [];
}

export function docsNavFor(
  href: string,
  items: readonly DocsNavEntry[],
): ArticleNav | undefined {
  const links = docsNavLinks(items);
  const i = links.findIndex((item) => item.href === href);
  if (i < 0) return undefined;
  const prev =
    i > 0 ? { href: links[i - 1]!.href, title: links[i - 1]!.title } : undefined;
  const next =
    i < links.length - 1
      ? { href: links[i + 1]!.href, title: links[i + 1]!.title }
      : undefined;
  if (!prev && !next) return undefined;
  return { prev, next };
}

export function docsSidebarHtml(
  items: readonly DocsNavEntry[],
  currentHref: string,
  fromRel: string,
): string {
  if (items.length === 0) return "";
  const parts: string[] = [];
  let openList = false;
  for (const entry of items) {
    if (!isDocsNavLink(entry)) {
      if (openList) {
        parts.push("</ul>\n");
        openList = false;
      }
      parts.push(
        `<p class="docs-nav-section">${escapeHtml(entry.section)}</p>\n`,
      );
      continue;
    }
    if (!openList) {
      parts.push('<ul class="docs-nav-list">\n');
      openList = true;
    }
    const href = relLinkFrom(fromRel, entry.href);
    const current = entry.href === currentHref ? ' aria-current="page"' : "";
    parts.push(
      `<li class="docs-nav-item">` +
        `<a href="${escapeHtml(href)}" class="docs-nav-link"${current}>${escapeHtml(entry.title)}</a>` +
        `</li>\n`,
    );
  }
  if (openList) parts.push("</ul>\n");
  return (
    `<nav class="docs-sidebar-nav" aria-label="ドキュメント">\n` +
    `${parts.join("")}` +
    `</nav>\n`
  );
}

function pageTocHtml(outline: RenderedMarkdown["outline"], lang: string): string {
  const entries = outline.filter((e) => e.depth >= 2 && e.depth <= 4);
  if (entries.length < 2) return "";
  const label = siteLabels(lang).toc;
  const items = entries
    .map((e) => {
      const cls = e.depth > 2 ? ` class="page-toc-depth-${e.depth}"` : "";
      return (
        `<li${cls}><a href="#${escapeHtml(e.id)}">${escapeHtml(e.text)}</a></li>`
      );
    })
    .join("\n");
  return (
    `<nav class="page-toc" aria-label="${escapeHtml(label)}">\n` +
    `<p class="page-toc-title">${escapeHtml(label)}</p>\n` +
    `<ul class="page-toc-list">\n${items}\n</ul>\n` +
    `</nav>\n`
  );
}

function docsPagerHtml(nav: ArticleNav | undefined, lang: string): string {
  if (!nav?.prev && !nav?.next) return "";
  const labels = siteLabels(lang);
  const prev = nav.prev
    ? `<a class="docs-pager-card docs-pager-prev" href="${escapeHtml(nav.prev.href)}">` +
      `<span class="docs-pager-label">${escapeHtml(labels.prevPage)}</span>` +
      `<span class="docs-pager-title">${escapeHtml(nav.prev.title)}</span>` +
      `</a>`
    : `<span class="docs-pager-spacer" aria-hidden="true"></span>`;
  const next = nav.next
    ? `<a class="docs-pager-card docs-pager-next" href="${escapeHtml(nav.next.href)}">` +
      `<span class="docs-pager-label">${escapeHtml(labels.nextPage)}</span>` +
      `<span class="docs-pager-title">${escapeHtml(nav.next.title)}</span>` +
      `</a>`
    : `<span class="docs-pager-spacer" aria-hidden="true"></span>`;
  return (
    `<nav class="docs-pager" aria-label="${escapeHtml(labels.pageNav)}">\n` +
    `${prev}\n${next}\n` +
    `</nav>\n`
  );
}

export function renderDocsArticleBody(
  concept: OkfConcept,
  rendered: RenderedMarkdown,
  nav: ArticleNav | undefined,
  lang: string,
  opts?: DocsArticleRenderOpts,
): string {
  const badge = opts?.badgeHtml ?? "";
  const related = opts?.relatedHtml ?? "";
  const header = `<header>\n<h1>${escapeHtml(concept.title)}</h1>\n${badge}</header>\n`;
  const toc = pageTocHtml(rendered.outline, lang);
  const revisionBlock = revisionHistoryHtml(
    parseRevisionHistory(concept.frontmatter),
    lang,
  );
  return (
    `<article class="article-page docs-page${articleFontClass(concept)}">\n` +
    `${header}\n` +
    `${toc}` +
    `<div class="article-body docs-content">\n${rendered.html}</div>\n` +
    `${revisionBlock}` +
    `${related}` +
    `${docsPagerHtml(nav, lang)}\n` +
    `</article>\n`
  );
}

function formatNewsDate(iso?: string): string | undefined {
  return iso?.slice(0, 10);
}

export function renderDocsIndexBody(opts: {
  readonly siteTitle: string;
  readonly description?: string;
  readonly introHtml?: string;
  readonly docsNav: readonly DocsNavEntry[];
  readonly recentArticles?: readonly ArticleListEntry[];
  readonly newsLimit?: number;
  readonly archiveHref?: string;
  readonly profileUrl?: string;
  readonly githubUrl?: string;
  readonly lang?: string;
  readonly layout?: "landing" | "hub";
  readonly landingCtas?: readonly DocsNavLink[];
}): string {
  const labels = siteLabels(opts.lang ?? "ja");
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
  const intro = opts.introHtml ? `<div class="docs-intro">${opts.introHtml}</div>` : "";
  const layout = opts.layout ?? "hub";
  const landingCtas =
    layout === "landing" && opts.landingCtas && opts.landingCtas.length > 0
      ? `<nav class="docs-landing-cta" aria-label="${escapeHtml(labels.gettingStarted)}">\n` +
        opts.landingCtas
          .map((cta, i) => {
            const cls =
              i === 0 ? "docs-landing-cta-primary" : "docs-landing-cta-secondary";
            return (
              `<a href="${escapeHtml(cta.href)}" class="${cls}">${escapeHtml(cta.title)}</a>`
            );
          })
          .join("\n") +
        `\n</nav>\n`
      : "";
  const navGroupParts: string[] = [];
  let sectionTitle: string | undefined;
  let linkItems: string[] = [];
  const flushNavGroup = (): void => {
    if (linkItems.length === 0) return;
    const head = sectionTitle
      ? `<h3 class="docs-index-group-title">${escapeHtml(sectionTitle)}</h3>\n`
      : "";
    navGroupParts.push(
      `<div class="docs-index-group">\n${head}<ul class="docs-index-list">\n${linkItems.join("\n")}\n</ul>\n</div>\n`,
    );
    linkItems = [];
    sectionTitle = undefined;
  };
  for (const entry of opts.docsNav) {
    if (!isDocsNavLink(entry)) {
      flushNavGroup();
      sectionTitle = entry.section;
      continue;
    }
    linkItems.push(
      `<li class="docs-index-item">` +
        `<a href="${escapeHtml(entry.href)}" class="docs-index-link">${escapeHtml(entry.title)}</a>` +
        `</li>`,
    );
  }
  flushNavGroup();
  const navBody = navGroupParts.join("");
  const navSection =
    layout === "hub" && navBody.length > 0
      ? `<section class="docs-index-nav">\n` +
        `<h2>${escapeHtml(labels.documentation)}</h2>\n` +
        `${navBody}` +
        `</section>\n`
      : "";

  const limit = opts.newsLimit ?? opts.recentArticles?.length ?? 0;
  const newsItems = (opts.recentArticles ?? []).slice(0, limit);
  const newsList = newsItems
    .map((a) => {
      const date = formatNewsDate(a.timestamp);
      const dateHtml = date
        ? `<time datetime="${escapeHtml(date)}" class="docs-news-date">${escapeHtml(date)}</time> `
        : "";
      return (
        `<li class="docs-index-item">` +
        `${dateHtml}` +
        `<a href="${escapeHtml(a.href)}" class="docs-index-link">${escapeHtml(a.title)}</a>` +
        `</li>`
      );
    })
    .join("\n");
  const newsArchive =
    opts.archiveHref && newsItems.length > 0
      ? `<p class="docs-news-more"><a href="${escapeHtml(opts.archiveHref)}">${escapeHtml(labels.allNews)}</a></p>\n`
      : "";
  const newsClass =
    layout === "landing" ? "docs-index-news docs-index-news--compact" : "docs-index-news";
  const newsSection =
    newsItems.length > 0
      ? `<section class="${newsClass}">\n` +
        `<h2>${escapeHtml(labels.news)}</h2>\n` +
        `<ul class="docs-index-list docs-news-list">\n${newsList}\n</ul>\n` +
        `${newsArchive}` +
        `</section>\n`
      : "";
  const landingClass = layout === "landing" ? " docs-index--landing" : "";

  return (
    `<div class="docs-index${landingClass}">\n` +
    `<header class="docs-index-header">\n` +
    `<h1>${escapeHtml(opts.siteTitle)}</h1>\n` +
    (opts.description ? `<p class="blog-lead">${escapeHtml(opts.description)}</p>\n` : "") +
    (profile ? `<div class="blog-profile">${profile}</div>\n` : "") +
    `${landingCtas}` +
    `${intro}` +
    `</header>\n` +
    `${newsSection}` +
    `${navSection}` +
    `</div>\n`
  );
}

export function resolveDocsNav(
  nav: readonly DocsNavSpec[] | undefined,
  titleByHref: ReadonlyMap<string, string>,
): DocsNavEntry[] {
  if (!nav || nav.length === 0) return [];
  const out: DocsNavEntry[] = [];
  for (const spec of nav) {
    if (typeof spec === "string") {
      out.push({
        href: spec,
        title: titleByHref.get(spec) ?? spec.replace(/\.html$/i, ""),
      });
      continue;
    }
    if ("section" in spec) {
      out.push({ section: spec.section });
      continue;
    }
    const href = spec.href;
    out.push({
      href,
      title: spec.title ?? titleByHref.get(href) ?? href.replace(/\.html$/i, ""),
    });
  }
  return out;
}

export function renderDocsArticleFromConceptWithMeta(
  concept: OkfConcept,
  nav: ArticleNav | undefined,
  lang: string,
  opts?: DocsArticleRenderOpts,
): DocsArticleResult {
  const body = stripDuplicateTitleHeading(concept.body, concept.title);
  const rendered = renderMarkdownDocument(body, opts);
  return {
    bodyHtml: renderDocsArticleBody(concept, rendered, nav, lang, opts),
    diagrams: rendered.diagrams ?? { mermaid: 0, d2: 0, graphviz: 0 },
  };
}

export async function renderDocsArticleFromConceptWithMetaForConfig(
  concept: OkfConcept,
  nav: ArticleNav | undefined,
  lang: string,
  opts?: DocsArticleRenderOpts,
): Promise<DocsArticleResult> {
  const body = stripDuplicateTitleHeading(concept.body, concept.title);
  const rendered = needsAsyncDiagramCompile(opts?.diagrams)
    ? await renderMarkdownDocumentAsync(body, opts)
    : renderMarkdownDocument(body, opts);
  return {
    bodyHtml: renderDocsArticleBody(concept, rendered, nav, lang, opts),
    diagrams: rendered.diagrams ?? { mermaid: 0, d2: 0, graphviz: 0 },
  };
}

export function renderDocsArticleFromConcept(
  concept: OkfConcept,
  nav: ArticleNav | undefined,
  lang: string,
  opts?: DocsArticleRenderOpts,
): string {
  return renderDocsArticleFromConceptWithMeta(concept, nav, lang, opts).bodyHtml;
}