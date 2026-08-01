import type { OkfConcept } from "./normalize.ts";
import type { OkfActorEvent, OkfDateRange, OkfSourceEntry } from "./trust.ts";

const KEY_ORDER = [
  "type",
  "title",
  "timestamp",
  "description",
  "resource",
  "tags",
  "profile",
  "status",
  "stale_after",
  "generated",
  "verified",
  "sources",
  "usage_window",
  "digitalSourceType",
  "euAiLabel",
  "aiDisclosureNote",
  "aiSystems",
] as const;

/** @internal Exported for unit tests (YAML scalar quoting rules). */
export function formatScalar(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  const s = String(value);
  if (s.length === 0) return "''";
  if (/^\s|\s$/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/:(\s|$)/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/\s#/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  return s;
}

function appendAiSystemsEntry(
  lines: string[],
  key: string,
  systems: readonly { name: string; version?: string; provider?: string }[],
): void {
  lines.push(`${key}:`);
  for (const s of systems) {
    lines.push(`  - name: ${formatScalar(s.name)}`);
    if (s.version) lines.push(`    version: ${formatScalar(s.version)}`);
    if (s.provider) lines.push(`    provider: ${formatScalar(s.provider)}`);
  }
}

function appendDateRangeInline(range: OkfDateRange): string {
  const parts: string[] = [];
  if (range.from) parts.push(`from: ${formatScalar(range.from)}`);
  if (range.to) parts.push(`to: ${formatScalar(range.to)}`);
  return `{ ${parts.join(", ")} }`;
}

function appendActorInline(ev: OkfActorEvent): string {
  const parts = [`by: ${formatScalar(ev.by)}`];
  if (ev.at) parts.push(`at: ${formatScalar(ev.at)}`);
  return `{ ${parts.join(", ")} }`;
}

function appendSources(
  lines: string[],
  sources: readonly OkfSourceEntry[],
): void {
  lines.push("sources:");
  for (const s of sources) {
    lines.push(`  - resource: ${formatScalar(s.resource)}`);
    if (s.id) lines.push(`    id: ${formatScalar(s.id)}`);
    if (s.title) lines.push(`    title: ${formatScalar(s.title)}`);
    if (s.author) lines.push(`    author: ${formatScalar(s.author)}`);
    if (s.usage_count !== undefined) {
      lines.push(`    usage_count: ${formatScalar(s.usage_count)}`);
    }
    if (s.last_modified) lines.push(`    last_modified: ${formatScalar(s.last_modified)}`);
    if (s.usage_window) {
      lines.push(`    usage_window: ${appendDateRangeInline(s.usage_window)}`);
    }
  }
}

function appendYamlEntry(lines: string[], key: string, value: unknown): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${key}: []`);
      return;
    }
    const allScalar = value.every(
      (item) => item === null || typeof item !== "object",
    );
    if (allScalar) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${formatScalar(item)}`);
      }
      return;
    }
    lines.push(`${key}:`);
    for (const item of value) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>).filter(
          ([, v]) => v !== undefined,
        );
        if (entries.length === 0) {
          lines.push("  - {}");
          continue;
        }
        const [firstKey, firstVal] = entries[0]!;
        lines.push(`  - ${firstKey}: ${formatScalar(firstVal)}`);
        for (const [k, v] of entries.slice(1)) {
          if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            const nested = Object.entries(v as Record<string, unknown>)
              .filter(([, nv]) => nv !== undefined)
              .map(([nk, nv]) => `${nk}: ${formatScalar(nv)}`)
              .join(", ");
            lines.push(`    ${k}: { ${nested} }`);
          } else {
            lines.push(`    ${k}: ${formatScalar(v)}`);
          }
        }
      } else {
        lines.push(`  - ${formatScalar(item)}`);
      }
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    lines.push(`${key}:`);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      lines.push(`  ${k}: ${formatScalar(v)}`);
    }
    return;
  }
  lines.push(`${key}: ${formatScalar(value)}`);
}

/** OKF native frontmatter 行を組み立てる（旧キーは出力しない）。 */
export function toOkfFrontmatterLines(concept: OkfConcept): string[] {
  const lines: string[] = [];
  lines.push(`type: ${formatScalar(concept.type)}`);
  lines.push(`title: ${formatScalar(concept.title)}`);
  if (concept.timestamp) lines.push(`timestamp: ${formatScalar(concept.timestamp)}`);
  if (concept.description) lines.push(`description: ${formatScalar(concept.description)}`);
  if (concept.resource) lines.push(`resource: ${formatScalar(concept.resource)}`);
  if (concept.tags && concept.tags.length > 0) appendYamlEntry(lines, "tags", [...concept.tags]);
  if (concept.profile) lines.push(`profile: ${formatScalar(concept.profile)}`);

  if (concept.status) lines.push(`status: ${formatScalar(concept.status)}`);
  if (concept.stale_after) lines.push(`stale_after: ${formatScalar(concept.stale_after)}`);

  if (concept.generated) {
    lines.push(`generated: ${appendActorInline(concept.generated)}`);
  }
  if (concept.verified && concept.verified.length > 0) {
    if (concept.verified.length === 1) {
      lines.push(`verified: ${appendActorInline(concept.verified[0]!)}`);
    } else {
      lines.push("verified:");
      for (const ev of concept.verified) {
        lines.push(`  - ${appendActorInline(ev)}`);
      }
    }
  }
  if (concept.sources && concept.sources.length > 0) {
    appendSources(lines, concept.sources);
  }
  if (concept.usage_window) {
    lines.push(`usage_window: ${appendDateRangeInline(concept.usage_window)}`);
  }

  const fm = concept.frontmatter;
  if (typeof fm.digitalSourceType === "string" && fm.digitalSourceType.length > 0) {
    lines.push(`digitalSourceType: ${formatScalar(fm.digitalSourceType)}`);
  }
  if (typeof fm.euAiLabel === "string" && fm.euAiLabel.length > 0) {
    lines.push(`euAiLabel: ${formatScalar(fm.euAiLabel)}`);
  }
  if (typeof fm.aiDisclosureNote === "string" && fm.aiDisclosureNote.length > 0) {
    lines.push(`aiDisclosureNote: ${formatScalar(fm.aiDisclosureNote)}`);
  }
  if (Array.isArray(fm.aiSystems) && fm.aiSystems.length > 0) {
    const parsed = fm.aiSystems.filter(
      (s): s is { name: string; version?: string; provider?: string } =>
        s !== null &&
        typeof s === "object" &&
        !Array.isArray(s) &&
        typeof (s as { name?: unknown }).name === "string",
    );
    if (parsed.length > 0) appendAiSystemsEntry(lines, "aiSystems", parsed);
  }

  const ordered = new Set(KEY_ORDER);
  const restKeys = Object.keys(concept.frontmatter)
    .filter((k) => !ordered.has(k as (typeof KEY_ORDER)[number]))
    .sort();
  for (const key of restKeys) {
    appendYamlEntry(lines, key, concept.frontmatter[key]);
  }
  return lines;
}

/** Document → OKF native markdown。 */
export function conceptToOkfMarkdown(concept: OkfConcept): string {
  const lines = toOkfFrontmatterLines(concept);
  return `---\n${lines.join("\n")}\n---\n${concept.body}`;
}
