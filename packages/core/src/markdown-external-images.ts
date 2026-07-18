/** External (http/https/protocol-relative) Markdown image references. */

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)]\(([^)]+)\)/g;

export interface ExternalMarkdownImageRef {
  readonly url: string;
  readonly alt: string;
}

function imageTargetPath(raw: string): string {
  const trimmed = raw.trim();
  const unquoted = trimmed.replace(/^<|>$/g, "");
  const pathOnly = unquoted.split(/\s+/)[0] ?? "";
  return pathOnly.replace(/\\/g, "/");
}

function isExternalImageRef(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

function normalizeExternalUrl(raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  if (t.startsWith("//")) return `https:${t}`;
  if (/^https?:\/\//i.test(t)) return t;
  return null;
}

/** Extract external image URLs from Markdown body (hotlinks). */
export function extractExternalMarkdownImages(
  markdown: string,
): ExternalMarkdownImageRef[] {
  const out: ExternalMarkdownImageRef[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const path = imageTargetPath(match[2] ?? "");
    if (path.length === 0 || !isExternalImageRef(path)) continue;
    const url = normalizeExternalUrl(path);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, alt: (match[1] ?? "").trim() });
  }
  return out;
}
