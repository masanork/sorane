import type { OkfConcept } from "@sorane/okf";
import { resolveEffectiveType } from "@sorane/okf";

export type CatalogCreativeWorkType =
  | "BlogPosting"
  | "TechArticle"
  | "FAQPage"
  | "DefinedTermSet";

export function resolveCatalogCreativeWorkType(
  concept: OkfConcept,
  docsMode: boolean,
): CatalogCreativeWorkType {
  const effective = resolveEffectiveType(concept.type, concept.profile);
  if (effective === "reference") return "TechArticle";
  if (effective === "faq") return "FAQPage";
  if (effective === "glossary") return "DefinedTermSet";

  const override = concept.frontmatter.creativeWorkType;
  if (override === "TechArticle" || override === "BlogPosting") {
    return override;
  }
  return docsMode ? "TechArticle" : "BlogPosting";
}

export function isDatasetCatalogEntry(concept: OkfConcept): boolean {
  return resolveEffectiveType(concept.type, concept.profile) === "dataset";
}