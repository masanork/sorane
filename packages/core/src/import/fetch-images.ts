import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const MD_IMG_RE = /!\[[^\]]*]\((https?:\/\/[^)]+)\)/g;
const HTML_SRC_RE = /src="(https?:\/\/[^"]+)"/g;

export interface FetchImportImagesOptions {
  readonly cwd: string;
  readonly markdownPaths: readonly string[];
  /** Site static root relative to cwd (default `static`). */
  readonly staticDir?: string;
  readonly fetchFn?: typeof fetch;
}

export interface FetchImportImagesResult {
  readonly updatedFiles: readonly string[];
  readonly downloadedCount: number;
}

/** Collect unique external image URLs from markdown/HTML body text. */
export function collectExternalImageUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const re of [MD_IMG_RE, HTML_SRC_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      urls.add(m[1]!);
    }
  }
  return [...urls];
}

function shouldSkipUrl(url: string): boolean {
  return url.includes('google.com/analytics') || url.includes('hatena.ne.jp/keyword');
}

function urlHashFilename(url: string): string {
  const urlObj = new URL(url);
  let ext = extname(urlObj.pathname) || '.jpg';
  if (ext.includes('?')) ext = ext.split('?')[0]!;
  const hash = Buffer.from(url).toString('base64url').substring(0, 16);
  return `${hash}${ext}`;
}

async function downloadImage(
  url: string,
  destDir: string,
  fetchFn: typeof fetch,
): Promise<{ path: string; downloaded: boolean } | null> {
  try {
    const filename = urlHashFilename(url);
    const destPath = join(destDir, filename);
    if (existsSync(destPath)) {
      return { path: destPath, downloaded: false };
    }

    const response = await fetchFn(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoraneImport/1.0)' },
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(destPath, buffer);
    return { path: destPath, downloaded: true };
  } catch {
    return null;
  }
}

/** Rewrite external image URLs in text to `/images/imported/…` paths. */
export function rewriteExternalImagesInText(
  text: string,
  urlToRelative: Readonly<Record<string, string>>,
): string {
  let out = text;
  for (const [url, relative] of Object.entries(urlToRelative)) {
    out = out.split(url).join(relative);
  }
  return out;
}

/**
 * Download external images referenced in imported markdown files.
 * Skips analytics/keyword URLs; writes under `{staticDir}/images/imported/`.
 */
export async function fetchImportImages(
  opts: FetchImportImagesOptions,
): Promise<FetchImportImagesResult> {
  const staticDir = opts.staticDir ?? 'static';
  const imagesDir = join(opts.cwd, staticDir, 'images', 'imported');
  mkdirSync(imagesDir, { recursive: true });

  const fetchFn = opts.fetchFn ?? fetch;
  const updatedFiles: string[] = [];
  let downloadedCount = 0;

  for (const filePath of opts.markdownPaths) {
    let content = readFileSync(filePath, 'utf8');
    const urlToRelative: Record<string, string> = {};

    for (const url of collectExternalImageUrls(content)) {
      if (shouldSkipUrl(url)) continue;
      if (urlToRelative[url] !== undefined) continue;

      const result = await downloadImage(url, imagesDir, fetchFn);
      if (result === null) continue;

      urlToRelative[url] = `/images/imported/${basename(result.path)}`;
      if (result.downloaded) downloadedCount += 1;
    }

    if (Object.keys(urlToRelative).length === 0) continue;

    const next = rewriteExternalImagesInText(content, urlToRelative);
    if (next !== content) {
      writeFileSync(filePath, next, 'utf8');
      updatedFiles.push(filePath);
    }
  }

  return { updatedFiles, downloadedCount };
}