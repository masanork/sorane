/**
 * OKF v0.2 trust / provenance / lifecycle helpers.
 * Spec: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
 */

export type OkfConceptStatus = "draft" | "stable" | "deprecated";

/** Consumer-derived advisory tier from `verified` (§5.3). */
export type OkfTrustTier = "unverified" | "machine-confirmed" | "human-reviewed";

export interface OkfActorEvent {
  readonly by: string;
  readonly at: string;
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

function isIsoDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]! &&
    hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59;
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
  const from = typeof value.from === "string" && isIsoDateTime(value.from) ? value.from : undefined;
  const to = typeof value.to === "string" && isIsoDateTime(value.to) ? value.to : undefined;
  if (value.from !== undefined && from === undefined) {
    issues.push({ path: `${path}/from`, message: `${path}.from must be an ISO 8601 datetime with an explicit UTC offset` });
  }
  if (value.to !== undefined && to === undefined) {
    issues.push({ path: `${path}/to`, message: `${path}.to must be an ISO 8601 datetime with an explicit UTC offset` });
  }
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
  const at = typeof value.at === "string" && isIsoDateTime(value.at) ? value.at : undefined;
  if (!at) {
    issues.push({ path: `${path}/at`, message: `${path}.at is required and must be an ISO 8601 datetime with an explicit UTC offset` });
    return undefined;
  }
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
        typeof item.last_modified === "string" && isIsoDateTime(item.last_modified)
          ? item.last_modified
          : undefined,
      usage_window: parseDateRange(item.usage_window, `${path}/usage_window`, issues),
    };
    if (item.last_modified !== undefined && entry.last_modified === undefined) {
      issues.push({ path: `${path}/last_modified`, message: `${path}.last_modified must be an ISO 8601 datetime with an explicit UTC offset` });
    }
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
    if (typeof raw.stale_after === "string" && isIsoDateTime(raw.stale_after)) {
      stale_after = raw.stale_after;
    } else {
      issues.push({
        path: "stale_after",
        message: "stale_after must be an ISO 8601 datetime with an explicit UTC offset",
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

/** True when the current instant is on or after stale_after. */
export function isStale(stale_after: string | undefined, now = new Date()): boolean {
  if (!stale_after) return false;
  const deadline = Date.parse(stale_after);
  return Number.isFinite(deadline) && now.getTime() >= deadline;
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
