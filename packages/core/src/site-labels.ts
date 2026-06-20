export interface SiteLabels {
  readonly archive: string;
  readonly search: string;
  readonly feed: string;
  readonly profile: string;
  readonly github: string;
  readonly readMore: string;
  readonly pastArticles: string;
  readonly moreArticles: string;
  readonly yearArchive: string;
  readonly updated: string;
  readonly toc: string;
  readonly documentation: string;
  readonly prevPage: string;
  readonly nextPage: string;
  readonly pageNav: string;
  readonly skipToContent: string;
  readonly docsMenu: string;
  readonly aiDisclosureAria: string;
  readonly aiPolicyLink: string;
}

const JA: SiteLabels = {
  archive: "アーカイブ",
  search: "検索",
  feed: "フィード",
  profile: "プロフィール",
  github: "GitHub",
  readMore: "続きを読む →",
  pastArticles: "過去の記事",
  moreArticles: "さらに読む →",
  yearArchive: "年別に探す",
  updated: "更",
  toc: "目次",
  documentation: "ドキュメント",
  prevPage: "前へ",
  nextPage: "次へ",
  pageNav: "ページ",
  skipToContent: "本文へスキップ",
  docsMenu: "ドキュメントメニュー",
  aiDisclosureAria: "AI コンテンツ開示",
  aiPolicyLink: "AI 開示ポリシー",
};

const EN: SiteLabels = {
  archive: "Archive",
  search: "Search",
  feed: "Feed",
  profile: "Profile",
  github: "GitHub",
  readMore: "Read more →",
  pastArticles: "Archive",
  moreArticles: "More articles →",
  yearArchive: "Browse by year",
  updated: "upd",
  toc: "On this page",
  documentation: "Documentation",
  prevPage: "Previous",
  nextPage: "Next",
  pageNav: "Page",
  skipToContent: "Skip to content",
  docsMenu: "Documentation menu",
  aiDisclosureAria: "AI content disclosure",
  aiPolicyLink: "AI disclosure policy",
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
    labels.github,
    labels.readMore,
    labels.pastArticles,
    labels.moreArticles,
    labels.yearArchive,
    labels.updated,
    labels.toc,
    labels.documentation,
    labels.prevPage,
    labels.nextPage,
    labels.skipToContent,
    labels.docsMenu,
    labels.aiDisclosureAria,
    labels.aiPolicyLink,
    "サイト",
  ];
  if (includeSearch) parts.push(labels.search);
  return parts.join("");
}