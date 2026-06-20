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

export interface DocsArticleRenderOpts extends AsyncRenderOptions {
  readonly badgeHtml?: string;
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

export interface DocsNavItem {
  readonly href: string;
  readonly title: string;
}

export function docsNavFor(
  href: string,
  items: readonly DocsNavItem[],
): ArticleNav | undefined {
  const i = items.findIndex((item) => item.href === href);
  if (i < 0) return undefined;
  const prev =
    i > 0 ? { href: items[i - 1]!.href, title: items[i - 1]!.title } : undefined;
  const next =
    i < items.length - 1
      ? { href: items[i + 1]!.href, title: items[i + 1]!.title }
      : undefined;
  if (!prev && !next) return undefined;
  return { prev, next };
}

export function docsSidebarHtml(
  items: readonly DocsNavItem[],
  currentHref: string,
  fromRel: string,
): string {
  if (items.length === 0) return "";
  const links = items
    .map((item) => {
      const href = relLinkFrom(fromRel, item.href);
      const current = item.href === currentHref ? ' aria-current="page"' : "";
      return (
        `<li class="docs-nav-item">` +
        `<a href="${escapeHtml(href)}" class="docs-nav-link"${current}>${escapeHtml(item.title)}</a>` +
        `</li>`
      );
    })
    .join("\n");
  return (
    `<nav class="docs-sidebar-nav" aria-label="ドキュメント">\n` +
    `<ul class="docs-nav-list">\n${links}\n</ul>\n` +
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
  const header = `<header>\n<h1>${escapeHtml(concept.title)}</h1>\n${badge}</header>\n`;
  const toc = pageTocHtml(rendered.outline, lang);
  return (
    `<article class="article-page docs-page${articleFontClass(concept)}">\n` +
    `${header}\n` +
    `${toc}` +
    `<div class="article-body docs-content">\n${rendered.html}</div>\n` +
    `${docsPagerHtml(nav, lang)}\n` +
    `</article>\n`
  );
}

export function renderDocsIndexBody(opts: {
  readonly siteTitle: string;
  readonly description?: string;
  readonly introHtml?: string;
  readonly docsNav: readonly DocsNavItem[];
  readonly profileUrl?: string;
  readonly githubUrl?: string;
  readonly lang?: string;
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
  const items = opts.docsNav
    .map(
      (item) =>
        `<li class="docs-index-item">` +
        `<a href="${escapeHtml(item.href)}" class="docs-index-link">${escapeHtml(item.title)}</a>` +
        `</li>`,
    )
    .join("\n");
  const navSection =
    items.length > 0
      ? `<section class="docs-index-nav">\n` +
        `<h2>${escapeHtml(labels.documentation)}</h2>\n` +
        `<ul class="docs-index-list">\n${items}\n</ul>\n` +
        `</section>\n`
      : "";
  return (
    `<div class="docs-index">\n` +
    `<header class="docs-index-header">\n` +
    `<h1>${escapeHtml(opts.siteTitle)}</h1>\n` +
    (opts.description ? `<p class="blog-lead">${escapeHtml(opts.description)}</p>\n` : "") +
    (profile ? `<div class="blog-profile">${profile}</div>\n` : "") +
    `${intro}` +
    `</header>\n` +
    `${navSection}` +
    `</div>\n`
  );
}

export function resolveDocsNav(
  nav: readonly DocsNavSpec[] | undefined,
  titleByHref: ReadonlyMap<string, string>,
): DocsNavItem[] {
  if (!nav || nav.length === 0) return [];
  return nav.map((spec) => {
    const href = typeof spec === "string" ? spec : spec.href;
    const title =
      (typeof spec === "object" && spec.title) ||
      titleByHref.get(href) ||
      href.replace(/\.html$/i, "");
    return { href, title };
  });
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