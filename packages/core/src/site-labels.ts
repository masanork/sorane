export interface SiteLabels {
  readonly archive: string;
  readonly search: string;
  readonly feed: string;
  readonly profile: string;
  readonly readMore: string;
  readonly pastArticles: string;
  readonly updated: string;
}

const JA: SiteLabels = {
  archive: "アーカイブ",
  search: "検索",
  feed: "フィード",
  profile: "プロフィール",
  readMore: "続きを読む →",
  pastArticles: "過去の記事",
  updated: "更",
};

const EN: SiteLabels = {
  archive: "Archive",
  search: "Search",
  feed: "Feed",
  profile: "Profile",
  readMore: "Read more →",
  pastArticles: "Archive",
  updated: "upd",
};

export function siteLabels(lang: string): SiteLabels {
  return lang.startsWith("ja") ? JA : EN;
}