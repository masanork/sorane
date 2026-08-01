/**
 * OKF v0.2 trust / provenance / lifecycle helpers.
 * Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */

export type OkfConceptStatus = "draft" | "stable" | "deprecated";

/** Consumer-derived advisory tier from `verified` (§5.3). */
export type OkfTrustTier = "unverified" | "machine-confirmed" | "human-reviewed";

export interface OkfActorEvent {
  readonly by: string;
  readonly at?: string;
}

export interface OkfDateRange {
  readonly from?: string;
  readonly to?: string;
}

export interface OkfSourceEntry {
  readonly resource: string;
  readonly id?: string;
  readonly title?: string;
  readonly author?: string;
  readonly usage_count?: number;
  readonly last_modified?: string;
  readonly usage_window?: OkfDateRange;
}

export interface TrustParseResult {
  readonly generated?: OkfActorEvent;
  readonly verified?: readonly OkfActorEvent[];
  readonly sources?: readonly OkfSourceEntry[];
  readonly usage_window?: OkfDateRange;
  readonly status?: OkfConceptStatus;
  readonly stale_after?: string;
  readonly warnings: readonly string[];
  readonly issues: readonly { path: string; message: string }[];
}

const STATUS_SET = new Set<string>(["draft", "stable", "deprecated"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDateRange(
  value: unknown,
  path: string,
  issues: { path: string; message: string }[],
): OkfDateRange | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be a mapping with from/to` });
    return undefined;
  }
  const from = typeof value.from === "string" ? value.from : undefined;
  const to = typeof value.to === "string" ? value.to : undefined;
  if (from === undefined && to === undefined) {
    issues.push({ path, message: `${path} needs from and/or to` });
    return undefined;
  }
  return { from, to };
}

function parseActorEvent(
  value: unknown,
  path: string,
  issues: { path: string; message: string }[],
): OkfActorEvent | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be a mapping with by` });
    return undefined;
  }
  if (typeof value.by !== "string" || value.by.length === 0) {
    issues.push({ path: `${path}/by`, message: `${path}.by is required (actor string)` });
    return undefined;
  }
  const at = typeof value.at === "string" && value.at.length > 0 ? value.at : undefined;
  return { by: value.by, at };
}

function parseVerified(
  value: unknown,
  issues: { path: string; message: string }[],
): readonly OkfActorEvent[] | undefined {
  if (value === undefined) return undefined;
  if (isPlainObject(value)) {
    const one = parseActorEvent(value, "verified", issues);
    return one ? [one] : undefined;
  }
  if (!Array.isArray(value)) {
    issues.push({
      path: "verified",
      message: "verified must be a { by, at } mapping or a list of them",
    });
    return undefined;
  }
  const out: OkfActorEvent[] = [];
  value.forEach((item, i) => {
    const ev = parseActorEvent(item, `verified/${i}`, issues);
    if (ev) out.push(ev);
  });
  return out.length > 0 ? out : undefined;
}

function parseSources(
  value: unknown,
  issues: { path: string; message: string }[],
): readonly OkfSourceEntry[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ path: "sources", message: "sources must be a list" });
    return undefined;
  }
  const out: OkfSourceEntry[] = [];
  value.forEach((item, i) => {
    const path = `sources/${i}`;
    if (!isPlainObject(item)) {
      issues.push({ path, message: `${path} must be a mapping` });
      return;
    }
    if (typeof item.resource !== "string" || item.resource.length === 0) {
      issues.push({
        path: `${path}/resource`,
        message: `${path}.resource is required`,
      });
      return;
    }
    const entry: OkfSourceEntry = {
      resource: item.resource,
      id: typeof item.id === "string" ? item.id : undefined,
      title: typeof item.title === "string" ? item.title : undefined,
      author: typeof item.author === "string" ? item.author : undefined,
      usage_count:
        typeof item.usage_count === "number" && Number.isFinite(item.usage_count)
          ? item.usage_count
          : undefined,
      last_modified:
        typeof item.last_modified === "string" ? item.last_modified : undefined,
      usage_window: parseDateRange(item.usage_window, `${path}/usage_window`, issues),
    };
    out.push(entry);
  });
  return out.length > 0 ? out : undefined;
}

/** Parse optional OKF v0.2 trust families from raw frontmatter. */
export function parseTrustFields(raw: Record<string, unknown>): TrustParseResult {
  const issues: { path: string; message: string }[] = [];
  const warnings: string[] = [];

  const generated =
    raw.generated !== undefined
      ? parseActorEvent(raw.generated, "generated", issues)
      : undefined;
  const verified = parseVerified(raw.verified, issues);
  const sources = parseSources(raw.sources, issues);
  const usage_window = parseDateRange(raw.usage_window, "usage_window", issues);

  let status: OkfConceptStatus | undefined;
  if (raw.status !== undefined) {
    if (typeof raw.status === "string" && STATUS_SET.has(raw.status)) {
      status = raw.status as OkfConceptStatus;
    } else {
      issues.push({
        path: "status",
        message: 'status must be "draft", "stable", or "deprecated"',
      });
    }
  }

  let stale_after: string | undefined;
  if (raw.stale_after !== undefined) {
    if (typeof raw.stale_after === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.stale_after)) {
      stale_after = raw.stale_after;
    } else {
      issues.push({
        path: "stale_after",
        message: "stale_after must be an absolute date YYYY-MM-DD",
      });
    }
  }

  return {
    generated,
    verified,
    sources,
    usage_window,
    status,
    stale_after,
    warnings,
    issues,
  };
}

/** Derive OKF §5.3 trust tier from verified events. */
export function deriveTrustTier(
  verified: readonly OkfActorEvent[] | undefined,
): OkfTrustTier {
  if (!verified || verified.length === 0) return "unverified";
  if (verified.some((v) => v.by.startsWith("human:"))) return "human-reviewed";
  return "machine-confirmed";
}

/** True when today (UTC date) is on or after stale_after. */
export function isStale(stale_after: string | undefined, now = new Date()): boolean {
  if (!stale_after) return false;
  const today = now.toISOString().slice(0, 10);
  return today >= stale_after;
}

/** Keys reserved for OKF v0.2 trust families (excluded from generic frontmatter bag). */
export const TRUST_FRONTMATTER_KEYS = [
  "generated",
  "verified",
  "sources",
  "usage_window",
  "status",
  "stale_after",
] as const;
