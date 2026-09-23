/**
 * OKF Container Format (OKFC) — pack helpers (schema_version 1).
 *
 * Spec: bunko docs/okfc-spec.md (0.1-draft). FTS-only pack.
 * Concept id is the OKF bundle path without suffix: `{type}/{slug}`.
 */

import { createHash } from "node:crypto";
import type { OkfConcept } from "./normalize.ts";
import { conceptToOkfMarkdown } from "./serialize.ts";
import { chunkProseMarkdown, hashChunkText as hashProseChunkText } from "./chunk-prose.ts";
import { chunkConceptBody } from "./chunk-concept.ts";

export const OKFC_SCHEMA_VERSION = 1;
export const OKFC_OKF_VERSION = "0.2";
export const OKFC_PACK_TOOL = "tool:sorane/okfc-pack@0.5";

/** SQLite DDL for a Definition Profile OKFC file (no vec_chunks). */
export const OKFC_SCHEMA_SQL = `
CREATE TABLE okfc_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE concepts (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  title         TEXT,
  description   TEXT,
  resource      TEXT,
  tags          TEXT,
  status        TEXT NOT NULL DEFAULT 'stable',
  stale_after   TEXT,
  generated_by  TEXT,
  generated_at  TEXT,
  frontmatter   TEXT NOT NULL,
  body          TEXT NOT NULL,
  body_format   TEXT NOT NULL DEFAULT 'markdown',
  source_hash   TEXT NOT NULL,
  packed_at     TEXT NOT NULL
);

CREATE INDEX idx_concepts_type        ON concepts(type);
CREATE INDEX idx_concepts_status      ON concepts(status);
CREATE INDEX idx_concepts_tags        ON concepts(tags);
CREATE INDEX idx_concepts_body_format ON concepts(body_format);

CREATE VIRTUAL TABLE concepts_fts USING fts5(
  body,
  content='concepts',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER concepts_ai AFTER INSERT ON concepts BEGIN
  INSERT INTO concepts_fts(rowid, body) VALUES (new.rowid, new.body);
END;
CREATE TRIGGER concepts_ad AFTER DELETE ON concepts BEGIN
  INSERT INTO concepts_fts(concepts_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
END;
CREATE TRIGGER concepts_au AFTER UPDATE ON concepts BEGIN
  INSERT INTO concepts_fts(concepts_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
  INSERT INTO concepts_fts(rowid, body) VALUES (new.rowid, new.body);
END;

CREATE TABLE sources (
  id            INTEGER PRIMARY KEY,
  concept_id    TEXT NOT NULL,
  source_id     TEXT,
  resource      TEXT NOT NULL,
  title         TEXT,
  author        TEXT,
  usage_count   INTEGER,
  last_modified TEXT
);
CREATE INDEX idx_sources_concept ON sources(concept_id);

CREATE TABLE verified (
  id            INTEGER PRIMARY KEY,
  concept_id    TEXT NOT NULL,
  verified_by   TEXT NOT NULL,
  verified_at   TEXT NOT NULL
);
CREATE INDEX idx_verified_concept ON verified(concept_id);

CREATE TABLE chunks (
  id            INTEGER PRIMARY KEY,
  concept_id    TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  heading_path  TEXT,
  heading_slug  TEXT,
  chunk_format  TEXT NOT NULL DEFAULT 'text',
  field_id      TEXT,
  text          TEXT NOT NULL,
  source_hash   TEXT NOT NULL
);
CREATE INDEX idx_chunks_concept  ON chunks(concept_id);
CREATE INDEX idx_chunks_field_id ON chunks(field_id);
`;

export interface OkfcPackConcept {
  readonly concept: OkfConcept;
  /** URL / file slug (no type prefix). */
  readonly slug: string;
  /**
   * Bundle-relative id without suffix. Default: `{type}/{slug}`.
   * Matches OKF bundle paths used in `okf/bundle.tar.gz`.
   */
  readonly id?: string;
}

export interface OkfcMetaInput {
  readonly bundle_id: string;
  readonly title?: string;
  readonly description?: string;
  readonly bundle_type?: string;
  readonly bundle_uri?: string;
  /** Override pack_tool actor string. */
  readonly pack_tool?: string;
  readonly okf_version?: string;
}

export interface OkfcChunk {
  readonly heading_path: string;
  readonly heading_slug: string;
  readonly text: string;
  readonly chunk_format: "text" | "entry";
}

export interface OkfcConceptRow {
  readonly id: string;
  readonly type: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly resource: string | null;
  readonly tags: string | null;
  readonly status: string;
  readonly stale_after: string | null;
  readonly generated_by: string | null;
  readonly generated_at: string | null;
  readonly frontmatter: string;
  readonly body: string;
  readonly body_format: string;
  readonly source_hash: string;
  readonly sources: readonly {
    readonly source_id: string | null;
    readonly resource: string;
    readonly title: string | null;
    readonly author: string | null;
    readonly usage_count: number | null;
    readonly last_modified: string | null;
  }[];
  readonly verified: readonly {
    readonly verified_by: string;
    readonly verified_at: string;
  }[];
  readonly chunks: readonly OkfcChunk[];
}

/** SHA-256 hex of frontmatter YAML + newline + body (canonical OKF markdown). */
export function hashOkfcSource(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

/** @deprecated Prefer hashChunkText from chunk-prose; re-export for compatibility. */
export function hashChunkText(text: string): string {
  return hashProseChunkText(text);
}

/** Full frontmatter object for the `frontmatter` JSON column (round-trip). */
export function conceptFrontmatterJson(concept: OkfConcept): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: concept.type,
    title: concept.title,
  };
  if (concept.timestamp) out.timestamp = concept.timestamp;
  if (concept.description) out.description = concept.description;
  if (concept.resource) out.resource = concept.resource;
  if (concept.tags && concept.tags.length > 0) out.tags = [...concept.tags];
  if (concept.profile) out.profile = concept.profile;
  if (concept.status) out.status = concept.status;
  if (concept.stale_after) out.stale_after = concept.stale_after;
  if (concept.generated) out.generated = { ...concept.generated };
  if (concept.verified && concept.verified.length > 0) {
    out.verified =
      concept.verified.length === 1
        ? { ...concept.verified[0]! }
        : concept.verified.map((v) => ({ ...v }));
  }
  if (concept.sources && concept.sources.length > 0) {
    out.sources = concept.sources.map((s) => ({ ...s }));
  }
  if (concept.usage_window) out.usage_window = { ...concept.usage_window };
  for (const [k, v] of Object.entries(concept.frontmatter)) {
    if (v !== undefined && !(k in out)) out[k] = v;
  }
  return out;
}

/**
 * Heading-section chunker for markdown bodies (OKFC §5.3 prose).
 * Delegates to the shared mdast-based `chunkProseMarkdown` (also used by search).
 */
export function chunkMarkdownBody(
  body: string,
  conceptTitle: string,
  opts: { minChars?: number } = {},
): OkfcChunk[] {
  return chunkProseMarkdown(body, conceptTitle, {
    minChars: opts.minChars,
  }).map((c) => ({
    heading_path: c.heading_path,
    heading_slug: c.heading_slug,
    text: c.text,
    chunk_format: "text" as const,
  }));
}

export function buildOkfcConceptRow(input: OkfcPackConcept): OkfcConceptRow {
  const { concept, slug } = input;
  const id = input.id ?? `${concept.type}/${slug}`;
  const markdown = conceptToOkfMarkdown(concept);
  const source_hash = hashOkfcSource(markdown);
  const fm = conceptFrontmatterJson(concept);

  const sources = (concept.sources ?? []).map((s) => ({
    source_id: s.id ?? null,
    resource: s.resource,
    title: s.title ?? null,
    author: s.author ?? null,
    usage_count: s.usage_count ?? null,
    last_modified: s.last_modified ?? null,
  }));

  const verified = (concept.verified ?? [])
    .filter((v) => typeof v.by === "string" && v.by.length > 0)
    .map((v) => ({
      verified_by: v.by,
      verified_at: v.at ?? new Date(0).toISOString(),
    }));

  return {
    id,
    type: concept.type,
    title: concept.title || null,
    description: concept.description ?? null,
    resource: concept.resource ?? null,
    tags: concept.tags && concept.tags.length > 0 ? concept.tags.join(",") : null,
    status: concept.status ?? "stable",
    stale_after: concept.stale_after ?? null,
    generated_by: concept.generated?.by ?? null,
    generated_at: concept.generated?.at ?? null,
    frontmatter: JSON.stringify(fm),
    body: concept.body,
    body_format: "markdown",
    source_hash,
    sources,
    verified,
    // U2.1: type-aware chunks (faq/glossary/dataset + prose) shared with search IR.
    chunks: chunkConceptBody(concept).map((c) => ({
      heading_path: c.heading_path,
      heading_slug: c.heading_slug,
      text: c.text,
      chunk_format: c.chunk_format,
    })),
  };
}
