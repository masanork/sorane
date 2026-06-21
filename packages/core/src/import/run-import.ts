import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseHatenaDiaryExport } from './adapters/hatena-diary.ts';
import { parseMtExport } from './adapters/mt.ts';
import { parseWordPressWxrExport } from './adapters/wordpress.ts';
import { readImportFile, type EncodingHint } from './decode.ts';
import { resolveImportFormat } from './detect-format.ts';
import { importEntryRelPath, importEntryToOkfMarkdown } from './okf-writer.ts';
import { loadImportManifest, saveImportManifest, upsertManifestEntry } from './manifest.ts';
import type { ImportEntry, ImportFormatId } from './types.ts';

export interface RunImportOptions {
  readonly cwd: string;
  readonly input: string;
  readonly format?: string;
  readonly out?: string;
  readonly encoding?: EncodingHint;
  readonly dryRun?: boolean;
  readonly skipDrafts?: boolean;
}

export interface RunImportResult {
  readonly format: ImportFormatId;
  readonly encoding: string;
  readonly files: readonly string[];
}

function parseEntries(format: ImportFormatId, text: string, skipDrafts: boolean): ImportEntry[] {
  switch (format) {
    case 'mt':
      return parseMtExport(text, { skipDrafts });
    case 'hatena-diary':
      return parseHatenaDiaryExport(text, { skipDrafts });
    case 'wordpress':
      return parseWordPressWxrExport(text, { skipDrafts });
    default:
      throw new Error(`unsupported import format: ${format}`);
  }
}

/** Import external blog export into content/ as OKF articles. */
export function runImport(opts: RunImportOptions): RunImportResult {
  const cwd = resolve(opts.cwd);
  const inputPath = resolve(opts.input);
  if (!existsSync(inputPath)) {
    throw new Error(`import input not found: ${inputPath}`);
  }

  const decoded = readImportFile(inputPath, { encoding: opts.encoding });
  const format = resolveImportFormat(opts.format ?? 'auto', decoded.text);
  const entries = parseEntries(format, decoded.text, opts.skipDrafts !== false);
  if (entries.length === 0) {
    throw new Error('no importable entries found in export file');
  }

  const outDir = resolve(cwd, opts.out ?? 'content/article');
  const manifest = loadImportManifest(cwd);
  let nextManifest = manifest;
  const files: string[] = [];

  for (const entry of entries) {
    const rel = join(opts.out ?? 'content/article', importEntryRelPath(entry)).replace(/\\/g, '/');
    const abs = resolve(cwd, rel);
    files.push(abs);

    if (opts.dryRun) continue;

    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, importEntryToOkfMarkdown(entry), 'utf8');
    nextManifest = upsertManifestEntry(nextManifest, {
      sourceId: entry.sourceId,
      relPath: rel,
      encoding: decoded.encoding,
      importedAt: new Date().toISOString(),
    });
  }

  if (!opts.dryRun) {
    saveImportManifest(cwd, nextManifest);
  }

  return {
    format,
    encoding: decoded.encoding,
    files,
  };
}