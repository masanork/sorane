import type { OkfConcept } from "@sorane/okf";
import { escapeHtml, stripDuplicateTitleHeading } from "./render.ts";
import { siteLabels } from "./site-labels.ts";

export const NOT_FOUND_SLUG = "404";

export function isNotFoundSource(relPath: string): boolean {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "") === NOT_FOUND_SLUG;
}

export interface NotFoundLabels {
  readonly heading: string;
  readonly message: string;
  readonly messageAlt?: string;
  readonly backToHome: string;
}

export function notFoundLabels(lang: string): NotFoundLabels {
  if (lang.startsWith("ja")) {
    return {
      heading: "404",
      message: "指定されたページは存在しません。",
      messageAlt: "Page not found.",
      backToHome: "トップページへ",
    };
  }
  return {
    heading: "404",
    message: "Page not found.",
    backToHome: "Back to home",
  };
}

export function renderDefaultNotFoundBody(lang: string, homeHref = "./index.html"): string {
  const labels = notFoundLabels(lang);
  const alt =
    labels.messageAlt !== undefined
      ? `<p lang="en">${escapeHtml(labels.messageAlt)}</p>\n`
      : "";
  return (
    `<article class="article-page not-found-page">\n` +
    `<header>\n<h1>${escapeHtml(labels.heading)}</h1>\n</header>\n` +
    `<div class="article-body">\n` +
    `<p>${escapeHtml(labels.message)}</p>\n` +
    `${alt}` +
    `<p><a href="${escapeHtml(homeHref)}">${escapeHtml(labels.backToHome)}</a></p>\n` +
    `</div>\n</article>`
  );
}

export function renderCustomNotFoundBody(concept: OkfConcept, bodyHtml: string): string {
  const title = concept.title.trim().length > 0 ? concept.title : notFoundLabels("ja").heading;
  return (
    `<article class="article-page not-found-page">\n` +
    `<header>\n<h1>${escapeHtml(title)}</h1>\n</header>\n` +
    `<div class="article-body">\n${bodyHtml}\n</div>\n` +
    `</article>`
  );
}

export function notFoundBodySource(concept: OkfConcept): string {
  return stripDuplicateTitleHeading(concept.body, concept.title);
}