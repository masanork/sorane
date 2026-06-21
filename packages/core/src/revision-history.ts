import { escapeHtml } from "./render.ts";
import { siteLabels } from "./site-labels.ts";

export interface RevisionEntry {
  readonly date: string;
  readonly summary: string;
}

function normalizeDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function parseRevisionEntry(raw: unknown): RevisionEntry | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const date =
    typeof o.date === "string"
      ? o.date
      : typeof o.updated === "string"
        ? o.updated
        : undefined;
  const summary =
    typeof o.summary === "string"
      ? o.summary
      : typeof o.note === "string"
        ? o.note
        : undefined;
  if (!date?.trim() || !summary?.trim()) return undefined;
  return { date: date.trim(), summary: summary.trim() };
}

/** frontmatter の `revisions` 配列を正規化（出現順を維持）。 */
export function parseRevisionHistory(
  frontmatter: Record<string, unknown>,
): readonly RevisionEntry[] {
  const raw = frontmatter.revisions;
  if (!Array.isArray(raw)) return [];
  const out: RevisionEntry[] = [];
  for (const item of raw) {
    const entry = parseRevisionEntry(item);
    if (entry) out.push(entry);
  }
  return out;
}

export type RevisionFindingCategory = "revision";

export interface RevisionFinding {
  readonly category: RevisionFindingCategory;
  readonly message: string;
}

/** `revisions` の形式・日付順を検証（warning のみ）。 */
export function validateRevisionFindings(
  frontmatter: Record<string, unknown>,
): readonly RevisionFinding[] {
  const raw = frontmatter.revisions;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    return [{ category: "revision", message: "revisions must be an array" }];
  }
  const findings: RevisionFinding[] = [];
  let prevKey: string | undefined;
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const entry = parseRevisionEntry(item);
    if (!entry) {
      findings.push({
        category: "revision",
        message: `revisions[${i}] needs date (or updated) and summary (or note)`,
      });
      continue;
    }
    const key = normalizeDateKey(entry.date);
    if (key.length < 10 || Number.isNaN(Date.parse(key))) {
      findings.push({
        category: "revision",
        message: `revisions[${i}].date is not a valid date: ${entry.date}`,
      });
    }
    if (prevKey !== undefined && key > prevKey) {
      findings.push({
        category: "revision",
        message: `revisions[${i}] is newer than the previous entry; list newest-first`,
      });
    }
    prevKey = key;
  }
  return findings;
}

function formatRevisionDate(iso: string): string {
  return iso.slice(0, 10);
}

/** 記事フッター向け更新履歴テーブル HTML。 */
export function revisionHistoryHtml(
  entries: readonly RevisionEntry[],
  lang: string,
): string {
  if (entries.length === 0) return "";
  const labels = siteLabels(lang);
  const rows = entries
    .map((e) => {
      const d = formatRevisionDate(e.date);
      return (
        `<tr><th scope="row"><time datetime="${escapeHtml(d)}">${escapeHtml(d)}</time></th>` +
        `<td>${escapeHtml(e.summary)}</td></tr>`
      );
    })
    .join("\n");
  return (
    `<section class="revision-history" aria-labelledby="revision-history-heading">` +
    `<h2 id="revision-history-heading">${escapeHtml(labels.revisionHistory)}</h2>` +
    `<table class="revision-history-table">` +
    `<thead><tr><th scope="col">${escapeHtml(labels.revisionDate)}</th>` +
    `<th scope="col">${escapeHtml(labels.revisionSummary)}</th></tr></thead>` +
    `<tbody>\n${rows}\n</tbody></table></section>`
  );
}