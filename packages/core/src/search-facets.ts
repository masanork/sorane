import { escapeHtml } from "./render.ts";

export interface SearchDocTypeFacet {
  readonly value: string;
  readonly labelJa: string;
  readonly labelEn: string;
}

/** Browser / CLI search `type` facet options (OKF 0.3 types included). */
export const SEARCH_DOC_TYPE_FACETS: readonly SearchDocTypeFacet[] = [
  { value: "", labelJa: "すべて", labelEn: "All" },
  { value: "article", labelJa: "記事", labelEn: "Articles" },
  { value: "dataset", labelJa: "データセット", labelEn: "Datasets" },
  { value: "reference", labelJa: "参照", labelEn: "Reference" },
  { value: "glossary", labelJa: "用語集", labelEn: "Glossary" },
  { value: "glossary-term", labelJa: "用語", labelEn: "Term" },
  { value: "faq", labelJa: "FAQ", labelEn: "FAQ" },
];

export function searchFacetLabel(facet: SearchDocTypeFacet, lang: string): string {
  return lang.startsWith("ja") ? facet.labelJa : facet.labelEn;
}

export function searchFacetOptionsHtml(lang: string): string {
  return SEARCH_DOC_TYPE_FACETS.map(
    (f) =>
      `<option value="${escapeHtml(f.value)}">${escapeHtml(searchFacetLabel(f, lang))}</option>`,
  ).join("");
}