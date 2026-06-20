export interface SiteLabels {
  readonly archive: string;
  readonly search: string;
  readonly feed: string;
  readonly profile: string;
  readonly readMore: string;
  readonly pastArticles: string;
  readonly updated: string;
  readonly toc: string;
  readonly documentation: string;
  readonly prevPage: string;
  readonly nextPage: string;
  readonly pageNav: string;
  readonly skipToContent: string;
  readonly docsMenu: string;
}

const JA: SiteLabels = {
  archive: "アーカイブ",
  search: "検索",
  feed: "フィード",
  profile: "プロフィール",
  readMore: "続きを読む →",
  pastArticles: "過去の記事",
  updated: "更",
  toc: "目次",
  documentation: "ドキュメント",
  prevPage: "前へ",
  nextPage: "次へ",
  pageNav: "ページ",
  skipToContent: "本文へスキップ",
  docsMenu: "ドキュメントメニュー",
};

const EN: SiteLabels = {
  archive: "Archive",
  search: "Search",
  feed: "Feed",
  profile: "Profile",
  readMore: "Read more →",
  pastArticles: "Archive",
  updated: "upd",
  toc: "On this page",
  documentation: "Documentation",
  prevPage: "Previous",
  nextPage: "Next",
  pageNav: "Page",
  skipToContent: "Skip to content",
  docsMenu: "Documentation menu",
};

export function siteLabels(lang: string): SiteLabels {
  return lang.startsWith("ja") ? JA : EN;
}

/** サイトヘッダ・フッタ等の固定 UI 文言（フォントサブセット用） */
export function siteChromeText(lang: string, siteTitle: string, includeSearch = false): string {
  const labels = siteLabels(lang);
  const parts = [
    siteTitle,
    labels.archive,
    labels.feed,
    labels.profile,
    labels.readMore,
    labels.pastArticles,
    labels.updated,
    labels.toc,
    labels.documentation,
    labels.prevPage,
    labels.nextPage,
    labels.skipToContent,
    labels.docsMenu,
    "サイト",
  ];
  if (includeSearch) parts.push(labels.search);
  return parts.join("");
}