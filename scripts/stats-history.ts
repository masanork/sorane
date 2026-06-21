#!/usr/bin/env node
/**
 * stats-history.ts — project-stats スナップショットの履歴追記と推移レポート
 *
 *   node scripts/stats-history.ts append <latest.json> [history.jsonl]
 *   node scripts/stats-history.ts trend [history.jsonl] [trend.md]
 *
 * CI (main): stats/latest.json → history.jsonl に追記 → trend.md を再生成
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_HISTORY = resolve(ROOT, "stats/history.jsonl");
const DEFAULT_TREND = resolve(ROOT, "stats/trend.md");
const MAX_ENTRIES = 400;

/** Compact row stored in history.jsonl (one JSON object per line). */
export interface StatsSnapshot {
  readonly at: string;
  readonly commit: string;
  readonly branch: string;
  readonly version: string;
  readonly packagesLines: number;
  readonly packagesFiles: number;
  readonly testFunctions: number;
  readonly testLines: number;
  readonly implLines: number;
  readonly totalLoc: number;
  readonly dependencies: number;
  readonly todoCount: number;
  readonly coveragePercent?: number;
  readonly workspaces: Record<string, number>;
  readonly ci?: {
    readonly runId?: string;
    readonly workflow?: string;
    readonly event?: string;
  };
}

interface FullStatsJson {
  readonly generatedAt: string;
  readonly version: string;
  readonly git: { readonly branch: string; readonly commit: string };
  readonly packages: {
    readonly files: number;
    readonly lines: number;
    readonly children?: readonly { readonly name: string; readonly lines: number }[];
  };
  readonly tests: { readonly testFunctions: number; readonly lines: number };
  readonly e2e: { readonly lines: number };
  readonly scripts: { readonly lines: number };
  readonly health: {
    readonly totalLoc: number;
    readonly dependencyCount: number;
    readonly todoCount: number;
  };
  readonly coverage?: { readonly totalPercent: number };
}

export function snapshotFromFullStats(full: FullStatsJson): StatsSnapshot {
  const workspaces: Record<string, number> = {};
  for (const c of full.packages.children ?? []) {
    workspaces[c.name] = c.lines;
  }
  const implLines = full.packages.lines + full.scripts.lines;
  const testLines = full.tests.lines + full.e2e.lines;
  const commit =
    process.env.GITHUB_SHA?.slice(0, 7) ?? full.git.commit;

  return {
    at: full.generatedAt,
    commit,
    branch: full.git.branch,
    version: full.version,
    packagesLines: full.packages.lines,
    packagesFiles: full.packages.files,
    testFunctions: full.tests.testFunctions + 0,
    testLines,
    implLines,
    totalLoc: full.health.totalLoc,
    dependencies: full.health.dependencyCount,
    todoCount: full.health.todoCount,
    ...(full.coverage
      ? { coveragePercent: Math.round(full.coverage.totalPercent * 10) / 10 }
      : {}),
    workspaces,
    ...(process.env.GITHUB_RUN_ID
      ? {
          ci: {
            runId: process.env.GITHUB_RUN_ID,
            workflow: process.env.GITHUB_WORKFLOW,
            event: process.env.GITHUB_EVENT_NAME,
          },
        }
      : {}),
  };
}

export async function readHistory(path: string): Promise<StatsSnapshot[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return [];
  }
  const out: StatsSnapshot[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as StatsSnapshot);
    } catch {
      // skip corrupt lines
    }
  }
  return out;
}

export async function appendHistory(
  historyPath: string,
  snapshot: StatsSnapshot,
): Promise<{ appended: boolean; total: number }> {
  const existing = await readHistory(historyPath);
  const last = existing.at(-1);
  if (last?.commit === snapshot.commit) {
    return { appended: false, total: existing.length };
  }
  const next = [...existing, snapshot];
  const pruned =
    next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  await mkdir(dirname(historyPath), { recursive: true });
  await writeFile(
    historyPath,
    pruned.map((s) => JSON.stringify(s)).join("\n") + "\n",
    "utf-8",
  );
  return { appended: true, total: pruned.length };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtDelta(n: number | undefined): string {
  if (n === undefined || n === 0) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmt(n)}`;
}

function fmtPctDelta(n: number | undefined): string {
  if (n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function renderTrendMarkdown(
  history: readonly StatsSnapshot[],
  window = 30,
): string {
  const rows = history.slice(-window);
  const lines: string[] = [];
  lines.push("# sorane Project Stats — Trend");
  lines.push("");
  lines.push(
    "Auto-generated from `stats/history.jsonl` on each CI run on `main`.",
  );
  lines.push("");

  if (rows.length === 0) {
    lines.push("_No history yet._");
    return lines.join("\n") + "\n";
  }

  const latest = rows.at(-1)!;
  const prev = rows.length >= 2 ? rows.at(-2) : undefined;
  const first = rows[0]!;

  lines.push("## Latest");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Timestamp | ${latest.at} |`);
  lines.push(`| Commit | \`${latest.commit}\` |`);
  lines.push(`| Version | \`${latest.version}\` |`);
  lines.push(`| Packages LOC | ${fmt(latest.packagesLines)} |`);
  lines.push(`| Test functions | ${fmt(latest.testFunctions)} |`);
  lines.push(`| Total LOC | ${fmt(latest.totalLoc)} |`);
  if (latest.coveragePercent !== undefined) {
    lines.push(`| Line coverage | ${latest.coveragePercent.toFixed(1)}% |`);
  }
  lines.push("");

  if (prev) {
    lines.push("## Δ vs previous run");
    lines.push("");
    lines.push("| Metric | Δ |");
    lines.push("|--------|---|");
    lines.push(
      `| Packages LOC | ${fmtDelta(latest.packagesLines - prev.packagesLines)} |`,
    );
    lines.push(
      `| Test functions | ${fmtDelta(latest.testFunctions - prev.testFunctions)} |`,
    );
    lines.push(`| Total LOC | ${fmtDelta(latest.totalLoc - prev.totalLoc)} |`);
    if (
      latest.coveragePercent !== undefined &&
      prev.coveragePercent !== undefined
    ) {
      lines.push(
        `| Coverage | ${fmtPctDelta(latest.coveragePercent - prev.coveragePercent)} |`,
      );
    }
    lines.push("");
  }

  if (rows.length >= 2) {
    lines.push(`## Δ vs oldest in window (${rows.length} runs)`);
    lines.push("");
    lines.push("| Metric | Start | Latest | Δ |");
    lines.push("|--------|-------|--------|---|");
    lines.push(
      `| Packages LOC | ${fmt(first.packagesLines)} | ${fmt(latest.packagesLines)} | ${fmtDelta(latest.packagesLines - first.packagesLines)} |`,
    );
    lines.push(
      `| Test functions | ${fmt(first.testFunctions)} | ${fmt(latest.testFunctions)} | ${fmtDelta(latest.testFunctions - first.testFunctions)} |`,
    );
    lines.push(
      `| Total LOC | ${fmt(first.totalLoc)} | ${fmt(latest.totalLoc)} | ${fmtDelta(latest.totalLoc - first.totalLoc)} |`,
    );
    lines.push("");
  }

  lines.push("## History");
  lines.push("");
  lines.push(
    "| At (UTC) | Commit | Ver | Pkg LOC | Tests | Total LOC | Cov% | Δ pkg |",
  );
  lines.push(
    "|----------|--------|-----|---------|-------|-----------|------|-------|",
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const prior = i > 0 ? rows[i - 1] : undefined;
    const deltaPkg = prior ? row.packagesLines - prior.packagesLines : undefined;
    const atShort = row.at.replace("T", " ").slice(0, 16);
    const cov =
      row.coveragePercent !== undefined
        ? row.coveragePercent.toFixed(1)
        : "—";
    lines.push(
      `| ${atShort} | \`${row.commit}\` | ${row.version} | ${fmt(row.packagesLines)} | ${fmt(row.testFunctions)} | ${fmt(row.totalLoc)} | ${cov} | ${fmtDelta(deltaPkg)} |`,
    );
  }
  lines.push("");

  const wsNames = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row.workspaces)) wsNames.add(k);
  }
  if (wsNames.size > 0) {
    lines.push("## Workspace LOC (latest)");
    lines.push("");
    lines.push("| Workspace | Lines |");
    lines.push("|-----------|-------|");
    const sorted = [...wsNames].sort(
      (a, b) => (latest.workspaces[b] ?? 0) - (latest.workspaces[a] ?? 0),
    );
    for (const name of sorted) {
      lines.push(`| \`${name}\` | ${fmt(latest.workspaces[name] ?? 0)} |`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

async function cmdAppend(latestPath: string, historyPath: string): Promise<void> {
  const raw = await readFile(latestPath, "utf-8");
  const full = JSON.parse(raw) as FullStatsJson;
  const snapshot = snapshotFromFullStats(full);
  const result = await appendHistory(historyPath, snapshot);
  if (result.appended) {
    console.log(
      `Appended ${snapshot.commit} to ${historyPath} (${result.total} entries)`,
    );
  } else {
    console.log(`Skip append: commit ${snapshot.commit} already recorded`);
  }
}

async function cmdTrend(historyPath: string, trendPath: string): Promise<void> {
  const history = await readHistory(historyPath);
  const md = renderTrendMarkdown(history);
  await mkdir(dirname(trendPath), { recursive: true });
  await writeFile(trendPath, md, "utf-8");
  console.log(`Wrote ${trendPath} (${history.length} entries)`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "append") {
    const latestPath = rest[0] ?? resolve(ROOT, "stats/latest.json");
    const historyPath = rest[1] ?? DEFAULT_HISTORY;
    await cmdAppend(latestPath, historyPath);
    return;
  }
  if (cmd === "trend") {
    const historyPath = rest[0] ?? DEFAULT_HISTORY;
    const trendPath = rest[1] ?? DEFAULT_TREND;
    await cmdTrend(historyPath, trendPath);
    return;
  }
  process.stderr.write(
    "usage: stats-history.ts append <latest.json> [history.jsonl]\n" +
      "       stats-history.ts trend [history.jsonl] [trend.md]\n",
  );
  process.exit(1);
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(import.meta.filename);

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}