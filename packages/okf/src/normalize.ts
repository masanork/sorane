/**
 * 入力 frontmatter を OKF native 表現に正規化する（純粋・決定論的）。
 *
 * OKF v0.2: `generated.at` may supply the content-change time when `timestamp` is absent.
 */

import {
  parseTrustFields,
  TRUST_FRONTMATTER_KEYS,
  type OkfActorEvent,
  type OkfConceptStatus,
  type OkfDateRange,
  type OkfSourceEntry,
} from "./trust.ts";

export type {
  OkfActorEvent,
  OkfConceptStatus,
  OkfDateRange,
  OkfSourceEntry,
  OkfTrustTier,
} from "./trust.ts";

export interface OkfConcept {
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly frontmatter: Record<string, unknown>;
  /** Effective content date: `timestamp`, else `generated.at`. */
  readonly timestamp?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly resource?: string;
  readonly profile?: string;
  /** OKF v0.2: how the current content was produced. */
  readonly generated?: OkfActorEvent;
  /** OKF v0.2: verification events (bare mapping normalized to a one-element list). */
  readonly verified?: readonly OkfActorEvent[];
  /** OKF v0.2: provenance sources. */
  readonly sources?: readonly OkfSourceEntry[];
  /** OKF v0.2: shared usage window for sources[].usage_count. */
  readonly usage_window?: OkfDateRange;
  /** OKF v0.2 lifecycle; absent ⇒ treat as stable. */
  readonly status?: OkfConceptStatus;
  /** OKF v0.2 absolute staleness date (YYYY-MM-DD). */
  readonly stale_after?: string;
  readonly warnings: readonly string[];
}

function resolveType(raw: Record<string, unknown>): string {
  if (typeof raw.type === "string" && raw.type.length > 0) return raw.type;
  return "";
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00Z`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return value;
  return d.toISOString();
}

function resolveTitle(raw: Record<string, unknown>, body: string, fallback: string): string {
  if (typeof raw.title === "string" && raw.title.length > 0) return raw.title;
  const m = body.match(/^#{1,6}\s+(.+?)\s*$/m);
  if (m?.[1]) return m[1].trim();
  return fallback;
}

const SKIP_FRONTMATTER = new Set<string>([
  "type",
  "kind",
  "layout",
  "timestamp",
  "publishedAt",
  "date",
  "title",
  ...TRUST_FRONTMATTER_KEYS,
]);

/** frontmatter オブジェクト + 本文から OKF concept を組み立てる。 */
export function normalizeConcept(
  raw: Record<string, unknown>,
  body: string,
  fallbackTitle: string,
): OkfConcept {
  const warnings: string[] = [];
  const type = resolveType(raw);
  const title = resolveTitle(raw, body, fallbackTitle);
  const trust = parseTrustFields(raw);
  warnings.push(...trust.warnings);

  const timestamp = raw.timestamp === undefined ? undefined : toIsoTimestamp(raw.timestamp);
  const generatedAt = trust.generated?.at ? toIsoTimestamp(trust.generated.at) : undefined;
  // OKF v0.2 §13.1: prefer timestamp when present.
  const effectiveTimestamp = timestamp ?? generatedAt;

  const frontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SKIP_FRONTMATTER.has(key)) continue;
    if (value !== undefined) frontmatter[key] = value;
  }

  const description =
    typeof raw.description === "string" && raw.description.length > 0
      ? raw.description
      : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  const resource =
    typeof raw.resource === "string" && raw.resource.length > 0
      ? raw.resource
      : undefined;
  const profile =
    typeof raw.profile === "string" && raw.profile.length > 0
      ? raw.profile
      : undefined;

  return {
    type,
    title,
    body,
    frontmatter,
    timestamp: effectiveTimestamp,
    description,
    tags,
    resource,
    profile,
    generated: trust.generated,
    verified: trust.verified,
    sources: trust.sources,
    usage_window: trust.usage_window,
    status: trust.status,
    stale_after: trust.stale_after,
    warnings,
  };
}
