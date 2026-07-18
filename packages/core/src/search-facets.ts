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

/**
 * Browser search `source` facet for IPTC `digital_source_type` on search chunks.
 * Values are filter keys consumed by `search.mjs` / `matchesSourceFacet`.
 */
export const SEARCH_SOURCE_FACETS: readonly SearchDocTypeFacet[] = [
  { value: "", labelJa: "生成元: すべて", labelEn: "Source: All" },
  { value: "ai-generated", labelJa: "AI生成・合成", labelEn: "AI-generated" },
  { value: "human", labelJa: "人間作成", labelEn: "Human-created" },
  { value: "disclosed", labelJa: "開示あり", labelEn: "Disclosed" },
];

const AI_SOURCE_CODES = [
  "trainedAlgorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
  "algorithmicMedia",
  "compositeSynthetic",
  "algorithmicallyEnhanced",
] as const;

const HUMAN_SOURCE_CODES = [
  "digitalCapture",
  "digitalCreation",
  "humanEdits",
  "compositeCapture",
  "dataDrivenMedia",
  "negativeFilm",
  "positiveFilm",
  "print",
] as const;

export function searchFacetLabel(facet: SearchDocTypeFacet, lang: string): string {
  return lang.startsWith("ja") ? facet.labelJa : facet.labelEn;
}

export function searchFacetOptionsHtml(lang: string): string {
  return SEARCH_DOC_TYPE_FACETS.map(
    (f) =>
      `<option value="${escapeHtml(f.value)}">${escapeHtml(searchFacetLabel(f, lang))}</option>`,
  ).join("");
}

export function searchSourceFacetOptionsHtml(lang: string): string {
  return SEARCH_SOURCE_FACETS.map(
    (f) =>
      `<option value="${escapeHtml(f.value)}">${escapeHtml(searchFacetLabel(f, lang))}</option>`,
  ).join("");
}

/** Match chunk `digital_source_type` (IPTC URI or short code) against a source facet value. */
export function matchesSourceFacet(
  digitalSourceType: string | undefined | null,
  facet: string,
): boolean {
  if (!facet) return true;
  const dst = (digitalSourceType ?? "").trim();
  if (facet === "disclosed") return dst.length > 0;
  if (dst.length === 0) return false;
  const lower = dst.toLowerCase();
  if (facet === "ai-generated") {
    return AI_SOURCE_CODES.some((code) => lower.includes(code.toLowerCase()));
  }
  if (facet === "human") {
    return HUMAN_SOURCE_CODES.some((code) => lower.includes(code.toLowerCase()));
  }
  return true;
}
