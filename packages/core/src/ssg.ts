import type { OkfConcept } from "@sorane/okf";
import { escapeHtml, renderMarkdown } from "./render.ts";

export function extractDescription(body: string, maxLen = 200): string | null {
  const lines = body.split(/\r?\n/);
  const para: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.length === 0) {
      if (para.length > 0) break;
      continue;
    }
    if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|\||={3,}|-{3,}|<)/.test(line)) {
      if (para.length > 0) break;
      continue;
    }
    para.push(line);
  }
  if (para.length === 0) return null;
  let text = para
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export interface PageShellOptions {
  readonly title: string;
  readonly siteTitle: string;
  readonly bodyHtml: string;
  readonly rootPrefix: string;
  readonly description?: string;
  readonly canonicalUrl?: string;
  readonly machineSources?: ReadonlyArray<{ href: string; type: string }>;
  readonly lang?: string;
  readonly extraHead?: ReadonlyArray<string>;
}

export function buildPage(opts: PageShellOptions): string {
  const titleEsc = escapeHtml(opts.title);
  const head: string[] = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${titleEsc}</title>`,
  ];
  if (opts.description) {
    const d = escapeHtml(opts.description);
    head.push(`<meta name="description" content="${d}">`);
    head.push(`<meta property="og:description" content="${d}">`);
  }
  head.push(
    `<meta property="og:title" content="${titleEsc}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${escapeHtml(opts.siteTitle)}">`,
    `<link rel="stylesheet" href="${opts.rootPrefix}assets/main.css">`,
    `<link rel="alternate" type="application/ld+json" href="${opts.rootPrefix}catalog.jsonld">`,
    `<link rel="help" type="text/plain" href="${opts.rootPrefix}llms.txt">`,
  );
  if (opts.canonicalUrl) {
    const u = escapeHtml(opts.canonicalUrl);
    head.push(`<link rel="canonical" href="${u}">`);
    head.push(`<meta property="og:url" content="${u}">`);
  }
  if (opts.machineSources) {
    for (const s of opts.machineSources) {
      head.push(
        `<link rel="alternate" type="${escapeHtml(s.type)}" href="${escapeHtml(s.href)}">`,
      );
    }
  }
  if (opts.extraHead) head.push(...opts.extraHead);
  const lang = opts.lang ?? "ja";
  return (
    "<!doctype html>\n" +
    `<html lang="${escapeHtml(lang)}">\n` +
    `<head>\n${head.join("\n")}\n</head>\n` +
    "<body>\n" +
    `<main>\n<article>\n${opts.bodyHtml}</article>\n</main>\n` +
    "</body>\n</html>\n"
  );
}

export function renderArticleBody(concept: OkfConcept): string {
  const header = [
    "<header>",
    `<h1>${escapeHtml(concept.title)}</h1>`,
    concept.timestamp
      ? `<p class="article-meta"><time datetime="${escapeHtml(concept.timestamp.slice(0, 10))}">${escapeHtml(concept.timestamp.slice(0, 10))}</time></p>`
      : "",
    "</header>",
  ].join("\n");
  return header + "\n" + renderMarkdown(concept.body);
}

export function renderIndexBody(
  siteTitle: string,
  articles: ReadonlyArray<{ title: string; href: string; timestamp?: string }>,
): string {
  const items = articles
    .map((a) => {
      const date = a.timestamp
        ? `<time datetime="${escapeHtml(a.timestamp.slice(0, 10))}">${escapeHtml(a.timestamp.slice(0, 10))}</time> — `
        : "";
      return `<li>${date}<a href="${escapeHtml(a.href)}">${escapeHtml(a.title)}</a></li>`;
    })
    .join("\n");
  return `<header><h1>${escapeHtml(siteTitle)}</h1></header>\n<ul class="article-list">\n${items}\n</ul>\n`;
}

/** content ルートからの相対パスに対する dist ルートからの rootPrefix を計算する。 */
export function rootPrefixFromRel(relPath: string): string {
  const depth = relPath.replace(/\\/g, "/").split("/").length - 1;
  return depth > 0 ? "../".repeat(depth) : "./";
}