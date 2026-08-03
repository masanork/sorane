/**
 * Search document chunking — U2.1: projects Knowledge IR (type-aware) to Chunk rows.
 * Canonical chunk texts live in `@sorane/okf` (`chunkConceptBody` / `buildKnowledgeIr`).
 */

import {
  extract,
  parseYaml,
  normalizeConcept,
  buildKnowledgeIr,
  conceptIdFor,
  PROSE_MIN_BODY,
  PROSE_MAX_BODY,
  CONCEPT_MIN_STRUCTURED,
} from "@sorane/okf";
import { searchChunksFromKnowledgeIr } from "./from-ir.ts";

/** Shared with OKFC via @sorane/okf (knowledge-index-unified). */
export const MIN_BODY = PROSE_MIN_BODY;
export const MIN_BODY_STRUCTURED = CONCEPT_MIN_STRUCTURED;
export const MAX_BODY = PROSE_MAX_BODY;

export interface Chunk {
  readonly source: string;
  readonly chunkIndex: number;
  readonly text: string;
  readonly headingPath: string;
  readonly headingSlug: string;
  readonly docType: string;
  readonly title: string;
  readonly timestamp: string;
  readonly tags: string;
}

function slugFromPath(relPath: string): string {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.(md|mdx)$/i, "");
}

function isNotFoundPath(relPath: string): boolean {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.(md|mdx)$/i, "") === "404";
}

export interface ChunkDocumentOptions {
  /** When true, index `draft: true` pages (preview / local only). Default false. */
  readonly includeDrafts?: boolean;
}

/**
 * 1 文書を検索チャンク列へ。
 * U2.1: parse → normalizeConcept → buildKnowledgeIr → searchChunksFromKnowledgeIr.
 *
 * Skips `isSystem`, 404 paths, and `draft: true` unless `includeDrafts`.
 */
export function chunkDocument(
  source: string,
  relPath: string,
  opts?: ChunkDocumentOptions,
): Chunk[] {
  if (isNotFoundPath(relPath)) return [];

  const { frontmatter, body } = extract(source);
  const fm =
    frontmatter !== null && frontmatter.length > 0
      ? ((parseYaml(frontmatter) as Record<string, unknown>) ?? {})
      : {};

  if (fm.isSystem === true) return [];
  if (fm.draft === true && opts?.includeDrafts !== true) return [];

  const slug = slugFromPath(relPath);
  const concept = normalizeConcept(fm, body, slug);
  if (!concept.type) return [];

  const id = conceptIdFor(concept.type, slug);
  const ir = buildKnowledgeIr(
    [{ concept, slug }],
    { sourcePathByConceptId: new Map([[id, relPath]]) },
  );
  return searchChunksFromKnowledgeIr(ir);
}
