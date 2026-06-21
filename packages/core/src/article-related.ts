import {
  docsNavLinks,
  docsSectionPeers,
  isDocsNavLink,
  type DocsNavEntry,
} from "./docs.ts";
import { escapeHtml } from "./render.ts";
import { relLinkFrom } from "./ssg.ts";
import { siteLabels } from "./site-labels.ts";

export interface RelatedLink {
  readonly href: string;
  readonly title: string;
}

function parseRelatedFrontmatter(
  frontmatter: Record<string, unknown>,
): readonly string[] {
  const raw = frontmatter.related;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function resolveHrefTitle(
  href: string,
  titleByHref: ReadonlyMap<string, string>,
): RelatedLink {
  const normalized = href.replace(/^\//, "");
  return {
    href: normalized,
    title: titleByHref.get(normalized) ?? normalized.replace(/\.html$/i, ""),
  };
}

/** frontmatter `related` と（任意で）同一 docs セクションのページから関連リンクを組み立てる。 */
export function resolveRelatedLinks(opts: {
  readonly frontmatter: Record<string, unknown>;
  readonly currentHref: string;
  readonly titleByHref: ReadonlyMap<string, string>;
  readonly docsNav?: readonly DocsNavEntry[];
  readonly includeSectionPeers?: boolean;
  readonly max?: number;
}): RelatedLink[] {
  const max = opts.max ?? 6;
  const seen = new Set<string>();
  const out: RelatedLink[] = [];

  const push = (link: RelatedLink): void => {
    if (link.href === opts.currentHref || seen.has(link.href)) return;
    seen.add(link.href);
    out.push(link);
  };

  for (const href of parseRelatedFrontmatter(opts.frontmatter)) {
    push(resolveHrefTitle(href, opts.titleByHref));
    if (out.length >= max) return out;
  }

  if (opts.includeSectionPeers && opts.docsNav) {
    for (const peer of docsSectionPeers(opts.currentHref, opts.docsNav)) {
      push(peer);
      if (out.length >= max) return out;
    }
  }

  return out;
}

/** docs ランディング向けの主要導線（先頭セクションの先頭 2 ページ）。 */
export function docsLandingCtas(
  nav: readonly DocsNavEntry[],
): readonly RelatedLink[] {
  const links = docsNavLinks(nav);
  return links.slice(0, 2);
}

export function renderArticleRelatedHtml(
  links: readonly RelatedLink[],
  fromRel: string,
  lang: string,
): string {
  if (links.length === 0) return "";
  const labels = siteLabels(lang);
  const items = links
    .map((link) => {
      const href = relLinkFrom(fromRel, link.href);
      return (
        `<li class="article-related-item">` +
        `<a href="${escapeHtml(href)}" class="article-related-link">${escapeHtml(link.title)}</a>` +
        `</li>`
      );
    })
    .join("\n");
  return (
    `<aside class="article-related" aria-label="${escapeHtml(labels.relatedPages)}">\n` +
    `<p class="article-related-title">${escapeHtml(labels.relatedPages)}</p>\n` +
    `<ul class="article-related-list">\n${items}\n</ul>\n` +
    `</aside>\n`
  );
}

