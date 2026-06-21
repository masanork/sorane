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
import { splitMarkdownOnH2 } from "./markup/mdast-section-split.ts";
import { escapeHtml } from "./render.ts";

const FENCE_OPEN_RE = /^(```+|~~~+)/;
const OTHER_HEADING_RE = /^(#{1,6})\s+/;

export interface GlossaryTerm {
  readonly label: string;
  readonly definitionMarkdown: string;
  readonly line: number;
  readonly anchorId?: string;
  readonly seeAlso?: readonly string[];
}

export interface ParseGlossaryBodyResult {
  readonly items: readonly GlossaryTerm[];
  readonly preambleMarkdown: string;
  readonly preambleLine?: number;
}

/** Markdown 本文から `##` 見出し単位の用語を抽出する（mdast 経由、ruby/termLink 保持）。 */
export function parseGlossaryBody(body: string): ParseGlossaryBodyResult {
  const { sections, preambleMarkdown, preambleLine } = splitMarkdownOnH2(body);
  return {
    items: sections.map((s) => ({
      label: s.label,
      definitionMarkdown: s.bodyMarkdown,
      line: s.line,
      anchorId: s.anchorId,
    })),
    preambleMarkdown,
    preambleLine,
  };
}

function parseGlossaryTermsFrontmatter(
  frontmatter: Record<string, unknown>,
): readonly GlossaryTerm[] {
  const raw = frontmatter.terms;
  if (!Array.isArray(raw)) return [];
  const items: GlossaryTerm[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    if (label.length === 0) continue;
    const definition =
      typeof rec.definition === "string" ? rec.definition : "";
    const anchorId = typeof rec.id === "string" && rec.id.length > 0 ? rec.id : undefined;
    const seeAlso = Array.isArray(rec.seeAlso)
      ? rec.seeAlso.filter((x): x is string => typeof x === "string")
      : undefined;
    items.push({
      label,
      definitionMarkdown: definition,
      line: i + 1,
      anchorId,
      seeAlso: seeAlso && seeAlso.length > 0 ? seeAlso : undefined,
    });
  }
  return items;
}

export function resolveGlossaryTerms(
  body: string,
  frontmatter: Record<string, unknown>,
): ParseGlossaryBodyResult & { readonly source: "body" | "frontmatter" } {
  const parsed = parseGlossaryBody(body);
  if (parsed.items.length > 0) {
    return { ...parsed, source: "body" };
  }
  return {
    items: parseGlossaryTermsFrontmatter(frontmatter),
    preambleMarkdown: parsed.preambleMarkdown,
    preambleLine: parsed.preambleLine,
    source: "frontmatter",
  };
}

/** `type: glossary` 向けの本文構造 warning。 */
export function validateGlossaryWarnings(
  body: string,
  frontmatter: Record<string, unknown>,
): readonly string[] {
  const warnings: string[] = [];
  const bodyTerms = parseGlossaryBody(body);
  const fmTerms = parseGlossaryTermsFrontmatter(frontmatter);
  const { items, preambleMarkdown, preambleLine, source } = resolveGlossaryTerms(
    body,
    frontmatter,
  );

  if (bodyTerms.items.length > 0 && fmTerms.length > 0) {
    warnings.push(
      "glossary: both body ## terms and frontmatter terms: present; build uses body terms",
    );
  }

  if (items.length === 0) {
    warnings.push(
      "glossary: no terms found; use ## headings in body or a frontmatter terms: list",
    );
    return warnings;
  }

  if (source === "body" && preambleMarkdown.length > 0 && preambleLine !== undefined) {
    warnings.push(
      `glossary: content before first term (line ${preambleLine}); start body with ##`,
    );
  }

  const anchorIds = new Set<string>();
  for (const term of items) {
    if (term.definitionMarkdown.length === 0) {
      warnings.push(`glossary: empty definition for "${term.label}" (line ${term.line})`);
    }
    if (!term.anchorId) {
      warnings.push(
        `glossary: term "${term.label}" has no {#id} anchor (line ${term.line}); recommended for cross-glossary links`,
      );
    } else if (anchorIds.has(term.anchorId)) {
      warnings.push(
        `glossary: duplicate anchor id "${term.anchorId}" (line ${term.line})`,
      );
    } else {
      anchorIds.add(term.anchorId);
    }
  }

  if (source === "body") {
    const lines = body.split(/\r?\n/);
    let inFence = false;
    let fenceMarker = "";
    let seenTerm = false;
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
        seenTerm = true;
        continue;
      }
      if (!seenTerm) {
        warnings.push(
          `glossary: use ## for terms; first heading is h${level} (line ${i + 1})`,
        );
      } else if (level === 1) {
        warnings.push(`glossary: h1 in body (line ${i + 1}); use ## for terms`);
      }
    }
  }

  return warnings;
}

function seeAlsoHtml(links: readonly string[]): string {
  const anchors = links
    .map((href) => `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`)
    .join(", ");
  return `<p class="glossary-see-also"><strong>See also:</strong> ${anchors}</p>`;
}

function glossaryTermHtml(term: GlossaryTerm, definitionHtml: string): string {
  const idAttr = term.anchorId ? ` id="${escapeHtml(term.anchorId)}"` : "";
  const seeAlso =
    term.seeAlso && term.seeAlso.length > 0 ? seeAlsoHtml(term.seeAlso) : "";
  return (
    `<section class="glossary-term"${idAttr}>` +
    `<h2 class="glossary-label">${escapeHtml(term.label)}</h2>` +
    `<div class="glossary-definition">${definitionHtml}${seeAlso}</div>` +
    `</section>`
  );
}

/** Glossary ランディング: ページ見出し + 用語セクション。 */
export function renderGlossaryPageBody(
  concept: OkfConcept,
  terms: readonly GlossaryTerm[],
  definitionHtmls: readonly string[],
  introHtml?: string,
): string {
  const description =
    typeof concept.description === "string" && concept.description.length > 0
      ? `<p class="glossary-description">${escapeHtml(concept.description)}</p>`
      : "";

  const language =
    typeof concept.frontmatter.language === "string" &&
    concept.frontmatter.language.length > 0
      ? `<p class="glossary-meta"><strong>Language:</strong> <code>${escapeHtml(concept.frontmatter.language)}</code></p>`
      : "";

  const sections = terms
    .map((term, i) => glossaryTermHtml(term, definitionHtmls[i] ?? ""))
    .join("\n");

  const intro = introHtml?.trim()
    ? `<div class="glossary-intro">${introHtml}</div>`
    : "";

  return (
    `<article class="glossary-page">` +
    `<header class="glossary-header">` +
    `<h1>${escapeHtml(concept.title)}</h1>` +
    description +
    language +
    `</header>` +
    intro +
    `<div class="glossary-list">${sections}</div>` +
    `</article>`
  );
}

function termJsonLdId(pageUrl: string, term: GlossaryTerm): string | undefined {
  if (!term.anchorId) return undefined;
  const base = pageUrl.split("#")[0]!;
  return `${base}#${term.anchorId}`;
}

export function buildGlossaryPageJsonLd(opts: {
  title: string;
  description?: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  siteTitle: string;
  lang: string;
  terms: readonly GlossaryTerm[];
  definitionHtmls: readonly string[];
  aiDisclosure?: AiDisclosure;
  associatedMedia?: readonly AssociatedMediaItem[];
  organization?: OrganizationSpec;
  frontmatter?: Record<string, unknown>;
}): string {
  const hasDefinedTerm = opts.terms.map((term, i) => {
    const node: Record<string, unknown> = {
      "@type": "DefinedTerm",
      name: term.label,
      description:
        plainTextFromHtml(opts.definitionHtmls[i] ?? "").trim() ||
        term.definitionMarkdown,
      inDefinedTermSet: { "@type": "DefinedTermSet", name: opts.title },
    };
    const termId = termJsonLdId(opts.url, term);
    if (termId) node["@id"] = termId;
    if (term.anchorId) node.termCode = term.anchorId;
    if (term.seeAlso && term.seeAlso.length > 0) node.sameAs = [...term.seeAlso];
    return node;
  });

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    headline: opts.title,
    name: opts.title,
    url: opts.url,
    inLanguage: opts.lang,
    isPartOf: { "@type": "WebSite", name: opts.siteTitle },
    hasDefinedTerm,
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