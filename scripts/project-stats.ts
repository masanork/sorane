#!/usr/bin/env node
/**
 * project-stats.ts — sorane モノレポ規模・健全性モニタリング
 *
 * 使用方法:
 *   node scripts/project-stats.ts [options]
 *   npm run stats                # ターミナル表示
 *   npm run stats:json           # JSON 出力
 *   npm run stats -- --save out  # out/ に JSON と Markdown を保存
 *
 * Options:
 *   --json             JSON 形式で標準出力
 *   --save <dir>       project-stats.json と project-stats.md を保存
 *   --coverage <file>  LCOV レポート（npm run test:coverage:lcov の coverage/lcov.info）
 *
 * 計測対象:
 *   - packages/*       @sorane/* 実装（ワークスペース別）
 *   - tests/           ユニット・統合（tests/e2e を除く）
 *   - tests/e2e/       Playwright E2E
 *   - scripts/         リポジトリスクリプト
 *   - docs/            開発者向け Markdown
 *   - design/          設計ドキュメント
 *   - website/content/ プロダクトサイト原稿
 */

import { execFileSync } from "node:child_process";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const JSON_OUTPUT = process.argv.includes("--json");
const SAVE_IDX = process.argv.indexOf("--save");
const SAVE_DIR: string | null = SAVE_IDX >= 0 ? (process.argv[SAVE_IDX + 1] ?? null) : null;
const COV_IDX = process.argv.indexOf("--coverage");
const COV_FILE: string | null = COV_IDX >= 0 ? (process.argv[COV_IDX + 1] ?? null) : null;

const DEFAULT_EXCLUDES = [
  /\/node_modules\//,
  /\/\.git\//,
  /\/dist\//,
  /\/build\//,
  /\/coverage\//,
  /\/test-results\//,
  /\/playwright-report\//,
  /\/\.sorane\//,
  /\/wasm\//,
  /\/vendor\//,
  /\/\.tools\//,
  /\/\.wrangler\//,
];

async function walk(dir: string, excludes: RegExp[] = DEFAULT_EXCLUDES): Promise<string[]> {
  const out: string[] = [];
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (excludes.some((re) => re.test(full + "/"))) continue;
    if (entry.isDirectory()) {
      out.push(...(await walk(full, excludes)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function readLineCount(file: string): Promise<number> {
  try {
    const content = await readFile(file, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

const TEST_FN_RE = /^\s*(test|it)\s*(?:\.(?:only|skip|todo|concurrent|each)[^\s(]*)?\s*\(/gm;

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path);
}

async function countTestFunctions(files: string[]): Promise<number> {
  let total = 0;
  for (const f of files) {
    if (!isTestFile(f)) continue;
    try {
      const content = await readFile(f, "utf-8");
      const matches = content.match(TEST_FN_RE);
      if (matches) total += matches.length;
    } catch {
      // ignore
    }
  }
  return total;
}

interface CategoryStats {
  name: string;
  path: string;
  files: number;
  lines: number;
  testFunctions: number;
  children?: CategoryStats[];
}

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function filterCode(files: string[]): string[] {
  return files.filter((f) => CODE_EXTS.has(extname(f)));
}

async function aggregate(dir: string, label: string): Promise<CategoryStats> {
  const files = filterCode(await walk(dir));
  let lines = 0;
  for (const f of files) lines += await readLineCount(f);
  const testFunctions = await countTestFunctions(files);
  return {
    name: label,
    path: relative(ROOT, dir),
    files: files.length,
    lines,
    testFunctions,
  };
}

async function aggregateWithChildren(dir: string, label: string): Promise<CategoryStats> {
  const self = await aggregate(dir, label);
  const children: CategoryStats[] = [];

  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return self;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (DEFAULT_EXCLUDES.some((re) => re.test(full + "/"))) continue;
    const child = await aggregate(full, entry.name);
    if (child.files > 0) children.push(child);
  }

  const directFiles: string[] = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      const full = join(dir, entry.name);
      if (CODE_EXTS.has(extname(full))) directFiles.push(full);
    }
  }
  if (directFiles.length > 0) {
    let lines = 0;
    for (const f of directFiles) lines += await readLineCount(f);
    children.push({
      name: "(root)",
      path: relative(ROOT, dir),
      files: directFiles.length,
      lines,
      testFunctions: await countTestFunctions(directFiles),
    });
  }

  children.sort((a, b) => b.lines - a.lines);
  self.children = children;
  return self;
}

interface DocsStats {
  files: number;
  lines: number;
}

async function aggregateMarkdown(dir: string): Promise<DocsStats> {
  const files = (await walk(dir)).filter((f) => extname(f) === ".md");
  let lines = 0;
  for (const f of files) lines += await readLineCount(f);
  return { files: files.length, lines };
}

async function aggregatePackageWorkspaces(): Promise<CategoryStats> {
  const packagesDir = join(ROOT, "packages");
  const children: CategoryStats[] = [];

  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch {
    return { name: "packages", path: "packages", files: 0, lines: 0, testFunctions: 0 };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const srcDir = join(packagesDir, entry.name, "src");
    const child = await aggregate(srcDir, `@sorane/${entry.name}`);
    if (child.files > 0) children.push(child);
  }

  children.sort((a, b) => b.lines - a.lines);
  const files = children.reduce((n, c) => n + c.files, 0);
  const lines = children.reduce((n, c) => n + c.lines, 0);
  const testFunctions = children.reduce((n, c) => n + c.testFunctions, 0);

  return {
    name: "packages",
    path: "packages",
    files,
    lines,
    testFunctions,
    children,
  };
}

async function aggregateTestsExcludingE2e(): Promise<CategoryStats> {
  const testsDir = join(ROOT, "tests");
  const all = filterCode(await walk(testsDir));
  const files = all.filter((f) => !f.includes("/tests/e2e/"));
  let lines = 0;
  for (const f of files) lines += await readLineCount(f);
  return {
    name: "tests",
    path: "tests",
    files: files.length,
    lines,
    testFunctions: await countTestFunctions(files),
  };
}

interface HealthMetrics {
  totalLoc: number;
  dependencyCount: number;
  todoCount: number;
}

const TODO_RE =
  /\/\/[^\n]*\b(TODO|FIXME|HACK|XXX)[:(]|\/\*[^*]*\b(TODO|FIXME|HACK|XXX)[:(]/g;

async function gatherHealth(
  packages: CategoryStats,
  tests: CategoryStats,
  e2e: CategoryStats,
  scripts: CategoryStats,
  docs: DocsStats,
  design: DocsStats,
  website: DocsStats,
): Promise<HealthMetrics> {
  const implFiles: string[] = [
    ...filterCode(await walk(join(ROOT, "packages"))),
    ...filterCode(await walk(join(ROOT, "scripts"))),
  ];
  let todoCount = 0;
  for (const f of implFiles) {
    try {
      const content = await readFile(f, "utf-8");
      todoCount += (content.match(TODO_RE) ?? []).length;
    } catch {
      // ignore
    }
  }

  let dependencyCount = 0;
  try {
    const lockRaw = await readFile(join(ROOT, "package-lock.json"), "utf-8");
    const lock = JSON.parse(lockRaw) as { packages?: Record<string, unknown> };
    if (lock.packages) {
      dependencyCount = Object.keys(lock.packages).filter((k) => k !== "").length;
    }
  } catch {
    // ignore
  }

  const totalLoc =
    packages.lines +
    tests.lines +
    e2e.lines +
    scripts.lines +
    docs.lines +
    design.lines +
    website.lines;

  return { totalLoc, dependencyCount, todoCount };
}

interface GitInfo {
  branch: string;
  commit: string;
  totalCommits: number;
}

function gatherGit(): GitInfo {
  const run = (args: string[]): string => {
    try {
      return execFileSync("git", args, { cwd: ROOT, encoding: "utf-8" }).trim();
    } catch {
      return "";
    }
  };
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
  const commit = run(["rev-parse", "--short", "HEAD"]);
  const totalCommits = parseInt(run(["rev-list", "--count", "HEAD"]), 10) || 0;
  return { branch, commit, totalCommits };
}

async function readPackageVersion(): Promise<string> {
  try {
    const raw = await readFile(join(ROOT, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

interface CoverageStats {
  totalLines: number;
  totalCovered: number;
  totalPercent: number;
  source: string;
}

async function loadCoverage(filePath: string): Promise<CoverageStats | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    let totalLines = 0;
    let totalCovered = 0;
    for (const line of content.split("\n")) {
      if (line.startsWith("LF:")) {
        const n = parseInt(line.slice(3), 10);
        if (!isNaN(n)) totalLines += n;
      } else if (line.startsWith("LH:")) {
        const n = parseInt(line.slice(3), 10);
        if (!isNaN(n)) totalCovered += n;
      }
    }
    if (totalLines === 0) {
      console.error(`  Warning: no LF/LH records found in ${filePath}`);
      return null;
    }
    return {
      totalLines,
      totalCovered,
      totalPercent: (totalCovered / totalLines) * 100,
      source: filePath,
    };
  } catch (err) {
    console.error(`  Warning: failed to parse coverage file: ${String(err)}`);
    return null;
  }
}

interface Stats {
  generatedAt: string;
  version: string;
  git: GitInfo;
  packages: CategoryStats;
  tests: CategoryStats;
  e2e: CategoryStats;
  scripts: CategoryStats;
  docs: DocsStats;
  design: DocsStats;
  website: DocsStats;
  health: HealthMetrics;
  coverage?: CoverageStats;
}

async function run(): Promise<Stats> {
  const [packages, tests, e2e, scripts, docs, design, website] = await Promise.all([
    aggregatePackageWorkspaces(),
    aggregateTestsExcludingE2e(),
    aggregate(join(ROOT, "tests/e2e"), "e2e"),
    aggregate(join(ROOT, "scripts"), "scripts"),
    aggregateMarkdown(join(ROOT, "docs")),
    aggregateMarkdown(join(ROOT, "design")),
    aggregateMarkdown(join(ROOT, "website/content")),
  ]);

  const health = await gatherHealth(packages, tests, e2e, scripts, docs, design, website);
  const git = gatherGit();
  const version = await readPackageVersion();
  const coverage = COV_FILE ? await loadCoverage(COV_FILE) : undefined;

  return {
    generatedAt: new Date().toISOString(),
    version,
    git,
    packages,
    tests,
    e2e,
    scripts,
    docs,
    design,
    website,
    health,
    ...(coverage ? { coverage } : {}),
  };
}

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

function pct(num: number, den: number): string {
  if (den === 0) return "  n/a";
  return `${Math.round((num / den) * 100)
    .toString()
    .padStart(3)}%`;
}

function bar(value: number, max: number, width = 16): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function color(code: string, t: string): string {
  return process.stdout.isTTY ? `\x1b[${code}m${t}\x1b[0m` : t;
}
const bold = (t: string) => color("1", t);
const dim = (t: string) => color("2", t);
const cyan = (t: string) => color("36", t);
const green = (t: string) => color("32", t);
const yell = (t: string) => color("33", t);
const red = (t: string) => color("31", t);

function printStats(s: Stats) {
  const sep = "─".repeat(72);

  console.log();
  console.log(bold("  sorane Project Stats"));
  console.log(
    dim(
      `  v${s.version}   ${s.generatedAt}   branch: ${s.git.branch}   commit: ${s.git.commit}`,
    ),
  );
  console.log(sep);

  console.log(bold("  Overview"));
  console.log(
    `  Packages            : ${fmt(s.packages.files).padStart(5)} files  (${fmt(s.packages.lines).padStart(7)} lines)`,
  );
  console.log(
    `  Tests (tests/)      : ${fmt(s.tests.files).padStart(5)} files  (${fmt(s.tests.lines).padStart(7)} lines, ${fmt(s.tests.testFunctions)} test fns)`,
  );
  console.log(
    `  E2E (tests/e2e/)    : ${fmt(s.e2e.files).padStart(5)} files  (${fmt(s.e2e.lines).padStart(7)} lines, ${fmt(s.e2e.testFunctions)} test fns)`,
  );
  console.log(
    `  Scripts (scripts/)  : ${fmt(s.scripts.files).padStart(5)} files  (${fmt(s.scripts.lines).padStart(7)} lines)`,
  );
  console.log(
    `  Docs (docs/)        : ${fmt(s.docs.files).padStart(5)} files  (${fmt(s.docs.lines).padStart(7)} lines)`,
  );
  console.log(
    `  Design (design/)    : ${fmt(s.design.files).padStart(5)} files  (${fmt(s.design.lines).padStart(7)} lines)`,
  );
  console.log(
    `  Website content     : ${fmt(s.website.files).padStart(5)} files  (${fmt(s.website.lines).padStart(7)} lines)`,
  );
  const implLines = s.packages.lines + s.scripts.lines;
  const testLines = s.tests.lines + s.e2e.lines;
  console.log(
    `  Test ratio          : ${pct(testLines, implLines + testLines)}  ${dim(`(${fmt(testLines)} test / ${fmt(implLines)} impl)`)}`,
  );
  console.log(`  Git commits         : ${fmt(s.git.totalCommits).padStart(5)}`);

  if (s.coverage) {
    const c = s.coverage;
    const covColor = c.totalPercent >= 90 ? green : c.totalPercent >= 80 ? yell : red;
    console.log(
      `  Line coverage       : ${covColor(`${c.totalPercent.toFixed(1)}%`)}  ${dim(`(${fmt(c.totalCovered)}/${fmt(c.totalLines)})`)}`,
    );
  }
  console.log(sep);

  console.log(bold("  Health Metrics"));
  console.log(
    `  Total LOC           : ${fmt(s.health.totalLoc).padStart(7)}  ${dim("(packages + tests + e2e + scripts + docs + design + website)")}`,
  );
  console.log(
    `  Dependencies        : ${fmt(s.health.dependencyCount).padStart(7)}  ${dim("(packages in package-lock.json)")}`,
  );
  const todoColor = s.health.todoCount < 10 ? green : s.health.todoCount < 30 ? yell : red;
  console.log(
    `  TODO / FIXME        : ${todoColor(fmt(s.health.todoCount).padStart(7))}  ${dim("(TODO/FIXME/HACK/XXX in packages + scripts)")}`,
  );
  console.log(sep);

  if (s.packages.children && s.packages.children.length > 0) {
    console.log(bold(`  packages  ${dim("(workspaces)")}`));
    console.log(
      dim(
        "  " +
          "workspace".padEnd(18) +
          "bar              " +
          " lines".padStart(8) +
          " files".padStart(7),
      ),
    );
    console.log(dim("  " + "─".repeat(60)));
    const max = Math.max(...s.packages.children.map((c) => c.lines));
    for (const c of s.packages.children) {
      console.log(
        "  " +
          cyan(c.name.padEnd(18)) +
          green(bar(c.lines, max)) +
          "  " +
          fmt(c.lines).padStart(8) +
          fmt(c.files).padStart(7),
      );
    }
    console.log(dim("  " + "─".repeat(60)));
    console.log(
      "  " +
        bold("TOTAL".padEnd(18)) +
        " ".repeat(18) +
        fmt(s.packages.lines).padStart(8) +
        fmt(s.packages.files).padStart(7),
    );
    console.log(sep);
  }
}

function buildMarkdown(s: Stats): string {
  const lines: string[] = [];
  lines.push("# sorane Project Stats");
  lines.push("");
  lines.push(`Version: \`${s.version}\``);
  lines.push(`Generated: ${s.generatedAt}`);
  lines.push(
    `Branch: \`${s.git.branch}\` | Commit: \`${s.git.commit}\` | Commits: ${s.git.totalCommits}`,
  );
  lines.push("");

  lines.push("## Overview");
  lines.push("");
  lines.push("| Category | Files | Lines | Test functions |");
  lines.push("|----------|-------|-------|----------------|");
  lines.push(`| Packages | ${fmt(s.packages.files)} | ${fmt(s.packages.lines)} | — |`);
  lines.push(
    `| Tests (\`tests/\`) | ${fmt(s.tests.files)} | ${fmt(s.tests.lines)} | ${fmt(s.tests.testFunctions)} |`,
  );
  lines.push(
    `| E2E (\`tests/e2e/\`) | ${fmt(s.e2e.files)} | ${fmt(s.e2e.lines)} | ${fmt(s.e2e.testFunctions)} |`,
  );
  lines.push(`| Scripts | ${fmt(s.scripts.files)} | ${fmt(s.scripts.lines)} | — |`);
  lines.push(`| Docs | ${fmt(s.docs.files)} | ${fmt(s.docs.lines)} | — |`);
  lines.push(`| Design | ${fmt(s.design.files)} | ${fmt(s.design.lines)} | — |`);
  lines.push(`| Website content | ${fmt(s.website.files)} | ${fmt(s.website.lines)} | — |`);
  lines.push("");

  const implLines = s.packages.lines + s.scripts.lines;
  const testLines = s.tests.lines + s.e2e.lines;
  const ratio =
    implLines + testLines > 0
      ? `${Math.round((testLines / (implLines + testLines)) * 100)}%`
      : "n/a";

  lines.push("## Health Metrics");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total LOC | ${fmt(s.health.totalLoc)} |`);
  lines.push(`| Dependencies (package-lock.json) | ${fmt(s.health.dependencyCount)} |`);
  lines.push(`| TODO / FIXME / HACK / XXX | ${fmt(s.health.todoCount)} |`);
  lines.push(`| Test ratio (lines) | ${ratio} |`);
  if (s.coverage) {
    lines.push(
      `| Line coverage | ${s.coverage.totalPercent.toFixed(1)}% (${fmt(s.coverage.totalCovered)}/${fmt(s.coverage.totalLines)}) |`,
    );
  }
  lines.push("");

  if (s.packages.children && s.packages.children.length > 0) {
    lines.push("## Packages breakdown");
    lines.push("");
    lines.push("| Workspace | Files | Lines |");
    lines.push("|-----------|-------|-------|");
    for (const c of s.packages.children) {
      lines.push(`| \`${c.name}\` | ${fmt(c.files)} | ${fmt(c.lines)} |`);
    }
    lines.push(`| **TOTAL** | **${fmt(s.packages.files)}** | **${fmt(s.packages.lines)}** |`);
    lines.push("");
  }

  return lines.join("\n");
}

async function saveStats(s: Stats, dir: string) {
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, "project-stats.json");
  await writeFile(jsonPath, JSON.stringify(s, null, 2) + "\n", "utf-8");
  console.log(`  Saved: ${jsonPath}`);
  const mdPath = join(dir, "project-stats.md");
  await writeFile(mdPath, buildMarkdown(s), "utf-8");
  console.log(`  Saved: ${mdPath}`);
}

const stats = await run();
if (JSON_OUTPUT) {
  console.log(JSON.stringify(stats, null, 2));
} else {
  printStats(stats);
}
if (SAVE_DIR) {
  await saveStats(stats, SAVE_DIR);
}