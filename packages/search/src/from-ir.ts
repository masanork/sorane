/**
 * Project Knowledge IR → search Chunk rows (U2 / U2.1).
 * Same chunk texts as OKFC when IR was built from the shared type-aware chunker.
 */

import type { KnowledgeIr, OkfConcept } from "@sorane/okf";
import type { Chunk } from "./chunker.ts";

function slugifyToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function slugifyTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Search facet tags: concept tags + dataset license/theme/format. */
export function searchTagsFromConcept(concept: OkfConcept): string {
  const tagSlugs = (concept.tags ?? []).map((t) => slugifyTag(String(t))).filter(Boolean);
  let tags = tagSlugs.join(",");
  if (concept.type === "dataset") {
    const fm = concept.frontmatter;
    const extra: string[] = [];
    const license = fm.license;
    if (typeof license === "string" && license.length > 0) {
      extra.push(`license:${slugifyToken(license)}`);
    }
    const theme = fm.theme;
    if (typeof theme === "string" && theme.length > 0) {
      extra.push(`theme:${slugifyToken(theme)}`);
    }
    const distributions = fm.distributions;
    if (Array.isArray(distributions)) {
      for (const item of distributions) {
        if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
        const format = (item as { format?: unknown }).format;
        if (typeof format === "string" && format.length > 0) {
          extra.push(`format:${slugifyToken(format)}`);
        }
      }
    }
    if (extra.length > 0) {
      tags = tags.length > 0 ? `${tags},${extra.join(",")}` : extra.join(",");
    }
  }
  return tags;
}

/** Convert IR chunks to IndexStore / web-export Chunk shape. */
export function searchChunksFromKnowledgeIr(ir: KnowledgeIr): Chunk[] {
  const byId = new Map(ir.concepts.map((c) => [c.id, c]));
  const out: Chunk[] = [];

  const sorted = [...ir.chunks].sort((a, b) => {
    const c = a.concept_id.localeCompare(b.concept_id);
    return c !== 0 ? c : a.chunk_index - b.chunk_index;
  });

  for (const ch of sorted) {
    const entry = byId.get(ch.concept_id);
    if (!entry) continue;
    const concept = entry.concept;
    out.push({
      source: entry.source_path ?? ch.concept_id,
      chunkIndex: ch.chunk_index,
      text: ch.text,
      headingPath: ch.heading_path,
      headingSlug: ch.heading_slug,
      docType: concept.type,
      title: concept.title,
      timestamp: concept.timestamp ?? "",
      tags: searchTagsFromConcept(concept),
    });
  }
  return out;
}
