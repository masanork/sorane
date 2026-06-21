import {
  isBuildableContentType,
  resolveEffectiveType,
  type ParsedConcept,
} from "@sorane/okf";
import type { SoraneConfig } from "../config.ts";
import { resolveGlossaryTerms } from "../glossary-page.ts";
import { resolveGlossaryTermMeta } from "../glossary-term-page.ts";
import { resolveI18nContext, resolvePageLocaleInfo, type I18nContext } from "../i18n.ts";
import { extractDescription } from "../ssg.ts";

export interface GlossaryLinkEntry {
  readonly termId: string;
  readonly href: string;
  readonly title: string;
  readonly description?: string;
}

export type GlossaryLinkIndex = ReadonlyMap<string, GlossaryLinkEntry>;

export function truncateTermDescription(text: string, maxLen = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= maxLen ? flat : flat.slice(0, maxLen);
}

function snippetFromMarkdown(md: string): string | undefined {
  const line = md.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!line) return undefined;
  const plain = line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_`]/g, "").trim();
  return plain.length > 0 ? truncateTermDescription(plain) : undefined;
}

function termIdFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff-]/g, "");
}

/** 全ページから glossary term リンク解決用インデックスを構築する。 */
export function buildGlossaryLinkIndex(
  parsed: readonly ParsedConcept[],
  config: SoraneConfig,
  ctx: I18nContext = resolveI18nContext(config.site),
): GlossaryLinkIndex {
  const map = new Map<string, GlossaryLinkEntry>();

  const setEntry = (termId: string, entry: GlossaryLinkEntry): void => {
    map.set(termId, entry);
  };

  for (const p of parsed) {
    if (!isBuildableContentType(p.concept.type, p.concept.profile)) continue;
    const effectiveType = resolveEffectiveType(p.concept.type, p.concept.profile);
    if (effectiveType !== "glossary-term") continue;
    const meta = resolveGlossaryTermMeta(p.concept.frontmatter);
    if (!meta.termId) continue;
    const { outRel } = resolvePageLocaleInfo(p, config, ctx);
    const rawDesc = p.concept.description ?? extractDescription(p.concept.body) ?? undefined;
    setEntry(meta.termId, {
      termId: meta.termId,
      href: outRel,
      title: p.concept.title,
      description: rawDesc ? truncateTermDescription(rawDesc) : undefined,
    });
  }

  for (const p of parsed) {
    if (!isBuildableContentType(p.concept.type, p.concept.profile)) continue;
    const effectiveType = resolveEffectiveType(p.concept.type, p.concept.profile);
    if (effectiveType !== "glossary") continue;
    const { outRel } = resolvePageLocaleInfo(p, config, ctx);
    const resolved = resolveGlossaryTerms(p.concept.body, p.concept.frontmatter);
    for (const item of resolved.items) {
      const termId =
        item.anchorId && item.anchorId.length > 0
          ? item.anchorId
          : termIdFromLabel(item.label);
      if (termId.length === 0) continue;
      const href =
        item.anchorId && item.anchorId.length > 0
          ? `${outRel}#${item.anchorId}`
          : outRel;
      setEntry(termId, {
        termId,
        href,
        title: item.label,
        description: snippetFromMarkdown(item.definitionMarkdown),
      });
    }
  }

  return map;
}

/** JSON fixture (`design/golden/markup/*.index.json`) からインデックスを読む。 */
export function glossaryLinkIndexFromRecord(
  record: Readonly<Record<string, GlossaryLinkEntry>>,
): GlossaryLinkIndex {
  return new Map(Object.entries(record));
}