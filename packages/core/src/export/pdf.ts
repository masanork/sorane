import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  isBuildableContentType,
  parseConcept,
  type ParsedConcept,
} from "@sorane/okf";
import type { SoraneConfig } from "../config.ts";
import { resolveI18nContext, resolvePageLocaleInfo } from "../i18n.ts";
import { okfValidateOptions } from "../okf-config.ts";
import {
  resolveVivliostyleInvocation,
  vivliostyleCliAvailable,
  vivliostyleHtmlToPdf,
  type VivliostyleInvocation,
} from "./vivliostyle-cli.ts";

export interface RunPdfExportOptions {
  readonly cwd: string;
  readonly config: SoraneConfig;
  /** 出力 .pdf ファイル、または複数ページ時の出力ディレクトリ。 */
  readonly out: string;
  /** `content_dir` からの相対 `.md` パス（単一ページ export）。 */
  readonly file?: string;
  /** `out_dir` からの相対 `.html` パス（単一ページ export）。 */
  readonly html?: string;
  readonly vivliostyleInvocation?: VivliostyleInvocation;
}

export interface RunPdfExportResult {
  readonly files: readonly string[];
}

function walkMarkdown(root: string): string[] {
  const out: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else if (name.endsWith(".md")) out.push(abs);
    }
  }
  visit(root);
  return out;
}

function pdfBasenameFromOutRel(outRel: string): string {
  const base = outRel.replace(/\\/g, "/").split("/").pop() ?? "page.html";
  return base.replace(/\.html$/i, ".pdf");
}

function pdfOutRelFromHtmlOutRel(outRel: string): string {
  return outRel.replace(/\.html$/i, ".pdf");
}

function resolveHtmlUnderDist(distDir: string, html: string): string {
  const abs = resolve(distDir, html);
  const normDist = `${resolve(distDir)}/`;
  const normAbs = resolve(abs);
  if (!normAbs.startsWith(normDist)) {
    throw new Error(`html path must be under ${distDir}`);
  }
  if (!existsSync(normAbs)) {
    throw new Error(`HTML file not found: ${normAbs} (run sorane build first)`);
  }
  return normAbs;
}

function exportHtmlToPdf(
  distDir: string,
  htmlAbs: string,
  outPath: string,
  invocation: VivliostyleInvocation,
): void {
  const htmlRel = relative(distDir, htmlAbs).replace(/\\/g, "/");
  vivliostyleHtmlToPdf(htmlRel, outPath, { cwd: distDir, invocation });
}

/** `dist/` のビルド済み HTML から PDF を export する（Vivliostyle CLI 必須）。 */
export function runPdfExport(opts: RunPdfExportOptions): RunPdfExportResult {
  if (!vivliostyleCliAvailable()) {
    throw new Error(
      "vivliostyle CLI not found; install @vivliostyle/cli, add vivliostyle to PATH, or set VIVLIOSTYLE",
    );
  }

  if (opts.file !== undefined && opts.html !== undefined) {
    throw new Error("export pdf accepts only one of --file or --html");
  }

  const cwd = resolve(opts.cwd);
  const distDir = resolve(cwd, opts.config.build.out_dir);
  if (!existsSync(distDir)) {
    throw new Error(
      `build output not found: ${distDir} (run sorane build before export --format pdf)`,
    );
  }

  const invocation = opts.vivliostyleInvocation ?? resolveVivliostyleInvocation();
  const outAbs = resolve(cwd, opts.out);
  const files: string[] = [];

  if (opts.html !== undefined) {
    const htmlAbs = resolveHtmlUnderDist(distDir, opts.html.replace(/\\/g, "/"));
    const outPath = outAbs.endsWith(".pdf")
      ? outAbs
      : join(outAbs, pdfBasenameFromOutRel(relative(distDir, htmlAbs)));
    exportHtmlToPdf(distDir, htmlAbs, outPath, invocation);
    files.push(outPath);
    return { files };
  }

  const contentDir = resolve(cwd, opts.config.build.content_dir);
  if (!existsSync(contentDir)) {
    throw new Error(`content directory not found: ${contentDir}`);
  }

  const okfOpts = okfValidateOptions(opts.config);
  const parsed: ParsedConcept[] = [];
  for (const abs of walkMarkdown(contentDir)) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    parsed.push(parseConcept(abs, rel, source, okfOpts));
  }

  const i18n = resolveI18nContext(opts.config.site);

  if (opts.file !== undefined) {
    const rel = opts.file.replace(/\\/g, "/");
    const match = parsed.find((p) => p.relPath.replace(/\\/g, "/") === rel);
    if (match === undefined) {
      throw new Error(`content file not found: ${rel}`);
    }
    if (!match.validation.ok) {
      throw new Error(`content file has OKF errors: ${rel}`);
    }
    const { outRel } = resolvePageLocaleInfo(match, opts.config, i18n);
    const htmlAbs = join(distDir, outRel);
    if (!existsSync(htmlAbs)) {
      throw new Error(`HTML file not found: ${htmlAbs} (run sorane build first)`);
    }
    const outPath = outAbs.endsWith(".pdf")
      ? outAbs
      : join(outAbs, pdfBasenameFromOutRel(outRel));
    exportHtmlToPdf(distDir, htmlAbs, outPath, invocation);
    files.push(outPath);
    return { files };
  }

  const outIsDir = !outAbs.endsWith(".pdf");
  if (!outIsDir) {
    throw new Error(
      "export all pages requires --out to be a directory (omit --file and --html to batch export)",
    );
  }

  mkdirSync(outAbs, { recursive: true });

  for (const p of parsed) {
    if (!p.validation.ok) continue;
    if (!isBuildableContentType(p.concept.type, p.concept.profile)) continue;
    const { outRel } = resolvePageLocaleInfo(p, opts.config, i18n);
    const htmlAbs = join(distDir, outRel);
    if (!existsSync(htmlAbs)) continue;
    const pdfRel = pdfOutRelFromHtmlOutRel(outRel);
    const outPath = join(outAbs, pdfRel);
    mkdirSync(dirname(outPath), { recursive: true });
    exportHtmlToPdf(distDir, htmlAbs, outPath, invocation);
    files.push(outPath);
  }

  if (files.length === 0) {
    throw new Error("no built HTML pages to export (run sorane build first)");
  }

  return { files };
}