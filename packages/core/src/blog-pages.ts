import { buildCompactAiBadgeHtml } from "./ai-disclosure.ts";
import type { ArticleListEntry } from "./ssg.ts";
import { escapeHtml } from "./render.ts";
import { siteLabels } from "./site-labels.ts";
import { relLinkFrom, renderBlogIndexBody, slugifyTag } from "./ssg.ts";

export { slugifyTag };

export function groupByYearMonth(
  articles: readonly ArticleListEntry[],
): Map<string, ArticleListEntry[]> {
  const byMonth = new Map<string, ArticleListEntry[]>();
  for (const a of articles) {
    const ym = a.timestamp?.slice(0, 7);
    if (!ym) continue;
    const list = byMonth.get(ym) ?? [];
    list.push(a);
    byMonth.set(ym, list);
  }
  return byMonth;
}

export function groupByYear(
  articles: readonly ArticleListEntry[],
): Map<string, ArticleListEntry[]> {
  const byYear = new Map<string, ArticleListEntry[]>();
  for (const a of articles) {
    const y = a.timestamp?.slice(0, 4);
    if (!y) continue;
    const list = byYear.get(y) ?? [];
    list.push(a);
    byYear.set(y, list);
  }
  return byYear;
}

export function groupByTag(
  articles: readonly ArticleListEntry[],
): Map<string, ArticleListEntry[]> {
  const byTag = new Map<string, ArticleListEntry[]>();
  for (const a of articles) {
    for (const tag of a.tags ?? []) {
      const slug = slugifyTag(tag);
      if (!slug) continue;
      const list = byTag.get(slug) ?? [];
      list.push(a);
      byTag.set(slug, list);
    }
  }
  return byTag;
}

export function paginate<T>(items: readonly T[], pageSize: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

export function blogPaginationRel(page: number): string {
  return page <= 1 ? "index.html" : `page/${page}.html`;
}

function formatYearMonthLabel(year: string, month: string, lang: string): string {
  if (lang.startsWith("ja")) return `${year}年${month}月`;
  return `${year}-${month}`;
}

function formatYearLabel(year: string, lang: string): string {
  return lang.startsWith("ja") ? `${year}年` : year;
}

export function renderArchiveListBody(
  title: string,
  description: string | undefined,
  articles: readonly ArticleListEntry[],
  opts?: {
    fromRel: string;
    page?: number;
    totalPages?: number;
    showOnLists?: boolean;
    listRootPrefix?: string;
    lang?: string;
  },
): string {
  const lang = opts?.lang ?? "ja";
  const labels = siteLabels(lang);
  const fromRel = opts?.fromRel ?? "index.html";
  const listPrefix = opts?.listRootPrefix ?? relLinkFrom(fromRel, "index.html").replace(/index\.html$/, "");
  const items = articles
    .map((a) => {
      const date = a.timestamp?.slice(0, 10) ?? "";
      const dateHtml = date
        ? `<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time> · `
        : "";
      const href = relLinkFrom(fromRel, a.href);
      const badge =
        opts?.showOnLists && a.aiDisclosure?.showBadge
          ? buildCompactAiBadgeHtml(a.aiDisclosure, { rootPrefix: listPrefix })
          : "";
      return (
        `<li class="blog-list-item">` +
        `${dateHtml}<a href="${escapeHtml(href)}" class="blog-list-title">${escapeHtml(a.title)}</a>` +
        `${badge}` +
        `</li>`
      );
    })
    .join("\n");

  let pager = "";
  const page = opts?.page;
  const totalPages = opts?.totalPages;
  if (page !== undefined && totalPages !== undefined && totalPages > 1) {
    const parts: string[] = [];
    if (page > 1) {
      parts.push(
        `<a href="${escapeHtml(relLinkFrom(fromRel, blogPaginationRel(page - 1)))}" rel="prev">← ${escapeHtml(labels.prevPage)}</a>`,
      );
    }
    parts.push(`<span>${page} / ${totalPages}</span>`);
    if (page < totalPages) {
      parts.push(
        `<a href="${escapeHtml(relLinkFrom(fromRel, blogPaginationRel(page + 1)))}" rel="next">${escapeHtml(labels.nextPage)} →</a>`,
      );
    }
    pager = `<nav class="blog-pagination" aria-label="${escapeHtml(labels.pageNav)}">${parts.join(" · ")}</nav>`;
  }

  return (
    `<div class="blog-index">\n` +
    `<header class="blog-header"><h1>${escapeHtml(title)}</h1>` +
    (description ? `<p class="blog-lead">${escapeHtml(description)}</p>` : "") +
    `</header>\n` +
    `<ul class="blog-list">\n${items}\n</ul>\n` +
    `${pager}\n` +
    `</div>\n`
  );
}

export function renderYearArchiveIndexBody(
  siteTitle: string,
  byYear: Map<string, ArticleListEntry[]>,
  fromRel = "archive/index.html",
  lang = "ja",
): string {
  const labels = siteLabels(lang);
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
  const items = years
    .map((y) => {
      const count = byYear.get(y)!.length;
      const href = relLinkFrom(fromRel, `archive/${y}.html`);
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(y)}</a> (${count})</li>`;
    })
    .join("\n");
  return (
    `<div class="blog-index">\n` +
    `<header class="blog-header"><h1>${escapeHtml(siteTitle)} — ${escapeHtml(labels.yearArchiveIndex)}</h1></header>\n` +
    `<ul class="blog-list">\n${items}\n</ul>\n` +
    `</div>\n`
  );
}

export function renderMonthListForYear(
  year: string,
  byMonth: Map<string, ArticleListEntry[]>,
  fromRel = `archive/${year}.html`,
  lang = "ja",
): string {
  const labels = siteLabels(lang);
  const months = [...byMonth.keys()]
    .filter((ym) => ym.startsWith(year))
    .sort((a, b) => b.localeCompare(a));
  const items = months
    .map((ym) => {
      const count = byMonth.get(ym)!.length;
      const label = ym.slice(5);
      const href = relLinkFrom(fromRel, `archive/${ym}.html`);
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(formatYearMonthLabel(year, label, lang))}</a> (${count})</li>`;
    })
    .join("\n");
  const backHref = relLinkFrom(fromRel, "archive/index.html");
  return (
    `<div class="blog-index">\n` +
    `<header class="blog-header"><h1>${escapeHtml(formatYearLabel(year, lang))}</h1></header>\n` +
    `<ul class="blog-list">\n${items}\n</ul>\n` +
    `<p><a href="${escapeHtml(backHref)}">${escapeHtml(labels.backToYearArchive)}</a></p>\n` +
    `</div>\n`
  );
}

export { renderBlogIndexBody };