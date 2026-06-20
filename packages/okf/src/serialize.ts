import type { OkfConcept } from "./normalize.ts";

const KEY_ORDER = [
  "type",
  "title",
  "timestamp",
  "description",
  "resource",
  "tags",
  "profile",
  "digitalSourceType",
  "euAiLabel",
  "aiDisclosureNote",
  "aiSystems",
] as const;

function formatScalar(value: unknown): string {
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

function appendYamlEntry(lines: string[], key: string, value: unknown): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${key}: []`);
      return;
    }
    lines.push(`${key}:`);
    for (const item of value) {
      lines.push(`  - ${formatScalar(item)}`);
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