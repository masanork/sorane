import { existsSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { isImageMetadataPath } from "./iptc-xmp-pass.ts";

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)]\(([^)]+)\)/g;

export type InlineImageKind = "static" | "content";

export interface MarkdownImageRef {
  readonly markdownPath: string;
  readonly sourceMdRel: string;
  readonly srcAbs: string;
  readonly kind: InlineImageKind;
  /** サイトルートからの公開パス（例: `static/hero.jpg`, `article/fig.png`） */
  readonly publicPath: string;
  readonly outRel: string;
  readonly alt: string;
}

function isExternalImageRef(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

function imageTargetPath(raw: string): string {
  const trimmed = raw.trim();
  const unquoted = trimmed.replace(/^<|>$/g, "");
  const pathOnly = unquoted.split(/\s+/)[0] ?? "";
  return pathOnly.replace(/\\/g, "/");
}

function publicPathForHtml(outHtmlRel: string, markdownPath: string): string {
  const htmlDir = dirname(outHtmlRel.replace(/\\/g, "/"));
  const joined = htmlDir.length > 0 ? join(htmlDir, markdownPath) : markdownPath;
  return normalize(joined).replace(/\\/g, "/");
}

/** Markdown 本文からローカル画像参照を抽出する。 */
export function extractMarkdownImagePaths(markdown: string): Array<{ alt: string; path: string }> {
  const out: Array<{ alt: string; path: string }> = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const path = imageTargetPath(match[2] ?? "");
    if (path.length === 0 || isExternalImageRef(path)) continue;
    out.push({ alt: (match[1] ?? "").trim(), path });
  }
  return out;
}

/** 単一の Markdown 画像参照を解決する（存在しない・非ラスタは null）。 */
export function resolveMarkdownImageRef(opts: {
  readonly markdownPath: string;
  readonly sourceMdRel: string;
  readonly outHtmlRel: string;
  readonly contentDir: string;
  readonly cwd: string;
  readonly staticDirName: string;
  readonly alt?: string;
}): MarkdownImageRef | null {
  const markdownPath = opts.markdownPath.replace(/\\/g, "/");
  if (!isImageMetadataPath(markdownPath)) return null;

  const sourceDir = dirname(opts.sourceMdRel.replace(/\\/g, "/"));
  const contentResolved = normalize(
    resolve(opts.contentDir, sourceDir === "." ? "" : sourceDir, markdownPath),
  );
  const staticRoot = resolve(opts.cwd, opts.staticDirName);

  if (contentResolved.startsWith(staticRoot) && existsSync(contentResolved)) {
    const staticRel = relative(staticRoot, contentResolved).replace(/\\/g, "/");
    const publicPath = `${opts.staticDirName}/${staticRel}`;
    return {
      markdownPath,
      sourceMdRel: opts.sourceMdRel,
      srcAbs: contentResolved,
      kind: "static",
      publicPath,
      outRel: join(opts.staticDirName, staticRel).replace(/\\/g, "/"),
      alt: opts.alt ?? "",
    };
  }

  if (
    contentResolved.startsWith(opts.contentDir) &&
    existsSync(contentResolved) &&
    isImageMetadataPath(contentResolved)
  ) {
    const publicPath = publicPathForHtml(opts.outHtmlRel, markdownPath);
    return {
      markdownPath,
      sourceMdRel: opts.sourceMdRel,
      srcAbs: contentResolved,
      kind: "content",
      publicPath,
      outRel: publicPath,
      alt: opts.alt ?? "",
    };
  }

  return null;
}

export function collectMarkdownImageRefs(opts: {
  readonly body: string;
  readonly sourceMdRel: string;
  readonly outHtmlRel: string;
  readonly contentDir: string;
  readonly cwd: string;
  readonly staticDirName: string;
}): MarkdownImageRef[] {
  const out: MarkdownImageRef[] = [];
  for (const { alt, path } of extractMarkdownImagePaths(opts.body)) {
    const resolved = resolveMarkdownImageRef({
      markdownPath: path,
      sourceMdRel: opts.sourceMdRel,
      outHtmlRel: opts.outHtmlRel,
      contentDir: opts.contentDir,
      cwd: opts.cwd,
      staticDirName: opts.staticDirName,
      alt,
    });
    if (resolved) out.push(resolved);
  }
  return out;
}

/** `srcAbs` で重複排除したインライン画像一覧。 */
export function dedupeMarkdownImageRefs(refs: readonly MarkdownImageRef[]): MarkdownImageRef[] {
  const seen = new Set<string>();
  const out: MarkdownImageRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.srcAbs)) continue;
    seen.add(ref.srcAbs);
    out.push(ref);
  }
  return out;
}