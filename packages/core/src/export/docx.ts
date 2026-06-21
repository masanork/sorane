import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  isBuildableContentType,
  parseConcept,
  resolveEffectiveType,
  type ParsedConcept,
} from "@sorane/okf";
import { mdastToPandoc } from "../ast/mdast-to-pandoc.ts";
import type { SoraneConfig } from "../config.ts";
import { buildGlossaryLinkIndex } from "../markup/glossary-link-index.ts";
import { processMarkdownToMdast } from "../markup/process-markdown.ts";
import { okfValidateOptions } from "../okf-config.ts";
import { resolveI18nContext } from "../i18n.ts";
import { stripDuplicateTitleHeading } from "../render.ts";
import { pandocCliAvailable, pandocJsonToDocx, resolvePandocBinary } from "./pandoc-cli.ts";
import type { GlossaryLinkIndex } from "../markup/glossary-link-index.ts";

export interface ExportDocxBodyOptions {
  readonly glossaryIndex?: GlossaryLinkIndex;
  readonly pandocBinary?: string;
}

export interface RunDocxExportOptions {
  readonly cwd: string;
  readonly config: SoraneConfig;
  /** 出力 .docx ファイル、または複数ページ時の出力ディレクトリ。 */
  readonly out: string;
  /** `content_dir` からの相対 `.md` パス（単一ページ export）。 */
  readonly file?: string;
}

export interface RunDocxExportResult {
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

function docxBasenameFromRel(relPath: string): string {
  const withoutExt = relPath.replace(/\.md$/i, "");
  const slug = withoutExt.split("/").pop() ?? withoutExt;
  return `${slug}.docx`;
}

function bodyMarkdownForExport(concept: ParsedConcept["concept"]): string {
  const effectiveType = resolveEffectiveType(concept.type, concept.profile);
  if (effectiveType === "article" || effectiveType === "glossary-term") {
    return stripDuplicateTitleHeading(concept.body, concept.title);
  }
  return concept.body;
}

/** Markdown 本文を Pandoc JSON 経由で docx に書き出す。 */
export function exportMarkdownBodyToDocx(
  body: string,
  outPath: string,
  opts?: ExportDocxBodyOptions,
): void {
  const tree = processMarkdownToMdast(body, { glossaryIndex: opts?.glossaryIndex });
  const doc = mdastToPandoc(tree);
  pandocJsonToDocx(doc, outPath, opts?.pandocBinary ?? resolvePandocBinary());
}

/** サイト content から docx を export する（Pandoc CLI 必須）。 */
export function runDocxExport(opts: RunDocxExportOptions): RunDocxExportResult {
  if (!pandocCliAvailable()) {
    throw new Error(
      "pandoc CLI not found; install pandoc or set PANDOC to the binary path",
    );
  }

  const cwd = resolve(opts.cwd);
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

  const glossaryIndex = buildGlossaryLinkIndex(
    parsed,
    opts.config,
    resolveI18nContext(opts.config.site),
  );
  const exportOpts: ExportDocxBodyOptions = { glossaryIndex };

  const outAbs = resolve(cwd, opts.out);
  const files: string[] = [];

  if (opts.file !== undefined) {
    const rel = opts.file.replace(/\\/g, "/");
    const match = parsed.find((p) => p.relPath.replace(/\\/g, "/") === rel);
    if (match === undefined) {
      throw new Error(`content file not found: ${rel}`);
    }
    if (!match.validation.ok) {
      throw new Error(`content file has OKF errors: ${rel}`);
    }
    const outPath = outAbs.endsWith(".docx") ? outAbs : join(outAbs, docxBasenameFromRel(rel));
    exportMarkdownBodyToDocx(bodyMarkdownForExport(match.concept), outPath, exportOpts);
    files.push(outPath);
    return { files };
  }

  const outIsDir = !outAbs.endsWith(".docx");
  if (!outIsDir) {
    throw new Error("export all pages requires --out to be a directory (omit --file to batch export)");
  }

  mkdirSync(outAbs, { recursive: true });

  for (const p of parsed) {
    if (!p.validation.ok) continue;
    if (!isBuildableContentType(p.concept.type, p.concept.profile)) continue;
    const rel = p.relPath.replace(/\\/g, "/");
    const outPath = join(outAbs, docxBasenameFromRel(rel));
    exportMarkdownBodyToDocx(bodyMarkdownForExport(p.concept), outPath, exportOpts);
    files.push(outPath);
  }

  if (files.length === 0) {
    throw new Error("no buildable content pages to export");
  }

  return { files };
}