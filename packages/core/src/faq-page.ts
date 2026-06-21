import type { OkfConcept } from "@sorane/okf";
import { plainTextFromHtml } from "@sorane/font";
import type { AiDisclosure } from "./ai-disclosure.ts";
import { aiDisclosureJsonLdFields } from "./ai-disclosure.ts";
import {
  associatedMediaJsonLdFields,
  type AssociatedMediaItem,
} from "./associated-media.ts";
import {
  buildOrganizationNode,
  creativeWorkFindabilityFields,
  type OrganizationSpec,
} from "./findability.ts";
import { escapeHtml } from "./render.ts";

const FENCE_OPEN_RE = /^(```+|~~~+)/;
const FAQ_HEADING_RE = /^##\s+(.+?)(?:\s*\{#([^}]+)\})?\s*$/;
const OTHER_HEADING_RE = /^(#{1,6})\s+/;

export interface FaqItem {
  readonly question: string;
  readonly answerMarkdown: string;
  readonly line: number;
  readonly anchorId?: string;
}

export interface ParseFaqResult {
  readonly items: readonly FaqItem[];
  readonly preambleMarkdown: string;
  readonly preambleLine?: number;
}

function stripFaqAnchorSuffix(question: string): string {
  return question.replace(/\s*\{#[^}]+\}\s*$/, "").trim();
}

/** Markdown 本文から `##` 見出し単位の Q/A を抽出する。 */
export function parseFaqBody(body: string): ParseFaqResult {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";
  const preamble: string[] = [];
  let preambleLine: number | undefined;
  const sections: {
    question: string;
    answerLines: string[];
    line: number;
    anchorId?: string;
  }[] = [];
  let current: (typeof sections)[number] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (line.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      if (current) current.answerLines.push(line);
      else preamble.push(line);
      continue;
    }
    if (inFence) {
      if (current) current.answerLines.push(line);
      else preamble.push(line);
      continue;
    }

    const hm = FAQ_HEADING_RE.exec(line);
    if (hm) {
      if (current) sections.push(current);
      current = {
        question: stripFaqAnchorSuffix(hm[1]!.trim()),
        answerLines: [],
        line: i + 1,
        anchorId: hm[2],
      };
      continue;
    }

    if (current) current.answerLines.push(line);
    else {
      if (line.trim().length > 0 && preambleLine === undefined) preambleLine = i + 1;
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  const items = sections.map((s) => ({
    question: s.question,
    answerMarkdown: s.answerLines.join("\n").trim(),
    line: s.line,
    anchorId: s.anchorId,
  }));

  return {
    items,
    preambleMarkdown: preamble.join("\n").trim(),
    preambleLine,
  };
}

/** `type: faq` 向けの本文構造 warning。 */
export function validateFaqWarnings(body: string): readonly string[] {
  const warnings: string[] = [];
  const { items, preambleMarkdown, preambleLine } = parseFaqBody(body);

  if (items.length === 0) {
    warnings.push("faq: no ## question headings found; use ## for each question");
    return warnings;
  }

  if (preambleMarkdown.length > 0 && preambleLine !== undefined) {
    warnings.push(
      `faq: content before first question (line ${preambleLine}); start body with ##`,
    );
  }

  for (const item of items) {
    if (item.answerMarkdown.length === 0) {
      warnings.push(`faq: empty answer for "${item.question}" (line ${item.line})`);
    }
  }

  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";
  let seenQuestion = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (line.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;
    const hm = OTHER_HEADING_RE.exec(line);
    if (!hm) continue;
    const level = hm[1]!.length;
    if (level === 2) {
      seenQuestion = true;
      continue;
    }
    if (!seenQuestion) {
      warnings.push(
        `faq: use ## for questions; first heading is h${level} (line ${i + 1})`,
      );
    } else if (level === 1) {
      warnings.push(`faq: h1 in body (line ${i + 1}); use ## for questions`);
    }
  }

  return warnings;
}

function faqSectionHtml(item: FaqItem, answerHtml: string): string {
  const idAttr = item.anchorId ? ` id="${escapeHtml(item.anchorId)}"` : "";
  return (
    `<section class="faq"${idAttr}>` +
    `<h2 class="faq-question">${escapeHtml(item.question)}</h2>` +
    `<div class="faq-answer">${answerHtml}</div>` +
    `</section>`
  );
}

/** FAQ ランディング: ページ見出し + Q/A セクション。 */
export function renderFaqPageBody(
  concept: OkfConcept,
  items: readonly FaqItem[],
  answerHtmls: readonly string[],
  introHtml?: string,
): string {
  const description =
    typeof concept.description === "string" && concept.description.length > 0
      ? `<p class="faq-description">${escapeHtml(concept.description)}</p>`
      : "";

  const sections = items
    .map((item, i) => faqSectionHtml(item, answerHtmls[i] ?? ""))
    .join("\n");

  const intro = introHtml?.trim()
    ? `<div class="faq-intro">${introHtml}</div>`
    : "";

  return (
    `<article class="faq-page">` +
    `<header class="faq-header">` +
    `<h1>${escapeHtml(concept.title)}</h1>` +
    description +
    `</header>` +
    intro +
    `<div class="faq-list">${sections}</div>` +
    `</article>`
  );
}

export function buildFaqPageJsonLd(opts: {
  title: string;
  description?: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  siteTitle: string;
  lang: string;
  items: readonly FaqItem[];
  answerHtmls: readonly string[];
  aiDisclosure?: AiDisclosure;
  associatedMedia?: readonly AssociatedMediaItem[];
  organization?: OrganizationSpec;
  frontmatter?: Record<string, unknown>;
}): string {
  const mainEntity = opts.items.map((item, i) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: plainTextFromHtml(opts.answerHtmls[i] ?? "").trim() || item.answerMarkdown,
    },
  }));

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    headline: opts.title,
    name: opts.title,
    url: opts.url,
    inLanguage: opts.lang,
    isPartOf: { "@type": "WebSite", name: opts.siteTitle },
    mainEntity,
  };
  if (opts.description) data.description = opts.description;
  if (opts.datePublished) data.datePublished = opts.datePublished;
  if (opts.dateModified) data.dateModified = opts.dateModified;
  if (opts.author) {
    data.author = { "@type": "Person", name: opts.author };
  }
  if (opts.organization) {
    data.publisher = buildOrganizationNode(opts.organization);
  }
  if (opts.frontmatter) {
    Object.assign(data, creativeWorkFindabilityFields(opts.frontmatter));
  }
  if (opts.aiDisclosure) {
    Object.assign(data, aiDisclosureJsonLdFields(opts.aiDisclosure));
  }
  const mediaFields = associatedMediaJsonLdFields(opts.associatedMedia ?? []);
  if (mediaFields) Object.assign(data, mediaFields);
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}