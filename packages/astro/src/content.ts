import { parseConcept, resolveEffectiveType, type ParsedConcept } from "@sorane/okf";
import type { SoraneAstroBackendFileInput } from "./contract.ts";

export function parseBackendFiles(files: readonly SoraneAstroBackendFileInput[]): ParsedConcept[] {
  return files.map((file) => parseConcept("", file.relPath, file.source));
}

export function slugForParsed(parsed: ParsedConcept): string {
  return parsed.relPath
    .replace(/\\/g, "/")
    .replace(/\.(md|mdx)$/i, "")
    .replace(/\/index$/i, "")
    .split("/")
    .filter(Boolean)
    .join("-") || "index";
}

export function hasAiDisclosure(parsed: ParsedConcept): boolean {
  const fm = parsed.concept.frontmatter;
  return typeof fm.digitalSourceType === "string" || fm.aiDisclosureNote !== undefined;
}

export function isAstroOkfContent(parsed: ParsedConcept): boolean {
  const effective = resolveEffectiveType(parsed.concept.type, parsed.concept.profile);
  return [
    "article",
    "index",
    "dataset",
    "reference",
    "glossary",
    "glossary-term",
    "faq",
  ].includes(effective);
}