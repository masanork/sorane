/**
 * 入力 frontmatter を OKF native 表現に正規化する（純粋・決定論的）。
 *
 * 移行期の旧キー:
 *   layout/kind → type
 *   date/publishedAt → timestamp (ISO 8601)
 */

export interface OkfConcept {
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly frontmatter: Record<string, unknown>;
  readonly timestamp?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly resource?: string;
  readonly profile?: string;
  readonly warnings: readonly string[];
}

function resolveType(raw: Record<string, unknown>, warnings: string[]): string {
  if (typeof raw.type === "string" && raw.type.length > 0) return raw.type;
  if (typeof raw.kind === "string" && raw.kind.length > 0) {
    warnings.push("deprecated: `kind` → use `type`");
    return raw.kind;
  }
  if (raw.layout === "blog") {
    warnings.push("deprecated: `layout: blog` → use `type: index`");
    return "index";
  }
  if (raw.layout === "article") {
    warnings.push("deprecated: `layout: article` → use `type: article`");
    return "article";
  }
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

function resolveTimestamp(raw: Record<string, unknown>, warnings: string[]): string | undefined {
  if (raw.timestamp !== undefined) {
    const ts = toIsoTimestamp(raw.timestamp);
    return ts;
  }
  if (raw.publishedAt !== undefined) {
    warnings.push("deprecated: `publishedAt` → use `timestamp`");
    return toIsoTimestamp(raw.publishedAt);
  }
  if (raw.date !== undefined) {
    warnings.push("deprecated: `date` → use `timestamp`");
    return toIsoTimestamp(raw.date);
  }
  return undefined;
}

function resolveTitle(raw: Record<string, unknown>, body: string, fallback: string): string {
  if (typeof raw.title === "string" && raw.title.length > 0) return raw.title;
  const m = body.match(/^#{1,6}\s+(.+?)\s*$/m);
  if (m?.[1]) return m[1].trim();
  return fallback;
}

/** frontmatter オブジェクト + 本文から OKF concept を組み立てる。 */
export function normalizeConcept(
  raw: Record<string, unknown>,
  body: string,
  fallbackTitle: string,
): OkfConcept {
  const warnings: string[] = [];
  const type = resolveType(raw, warnings);
  const title = resolveTitle(raw, body, fallbackTitle);
  const timestamp = resolveTimestamp(raw, warnings);

  const frontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "type" || key === "kind" || key === "layout") continue;
    if (key === "timestamp" || key === "publishedAt" || key === "date") continue;
    if (key === "title") continue;
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
    timestamp,
    description,
    tags,
    resource,
    profile,
    warnings,
  };
}