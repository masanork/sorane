import type { OkfConcept } from "@sorane/okf";
import { plainTextFromHtml } from "./plain-text.ts";
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
import { relLinkFrom } from "./ssg.ts";

export interface GlossaryTermPageMeta {
  readonly termId?: string;
  readonly inDefinedTermSet?: string;
  readonly seeAlso?: readonly string[];
}

function stringArray(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

export function resolveGlossaryTermMeta(
  frontmatter: Record<string, unknown>,
): GlossaryTermPageMeta {
  const termId =
    typeof frontmatter.term_id === "string" && frontmatter.term_id.trim().length > 0
      ? frontmatter.term_id.trim()
      : typeof frontmatter.termId === "string" && frontmatter.termId.trim().length > 0
        ? frontmatter.termId.trim()
        : undefined;
  const inDefinedTermSet =
    typeof frontmatter.inDefinedTermSet === "string" &&
    frontmatter.inDefinedTermSet.trim().length > 0
      ? frontmatter.inDefinedTermSet.trim()
      : typeof frontmatter.glossary === "string" && frontmatter.glossary.trim().length > 0
        ? frontmatter.glossary.trim()
        : undefined;
  return {
    termId,
    inDefinedTermSet,
    seeAlso: stringArray(frontmatter.seeAlso),
  };
}

/** `type: glossary-term` 向けの warning。 */
export function validateGlossaryTermWarnings(
  body: string,
  frontmatter: Record<string, unknown>,
): readonly string[] {
  const warnings: string[] = [];
  const meta = resolveGlossaryTermMeta(frontmatter);

  if (body.trim().length === 0) {
    warnings.push("glossary-term: empty body; add the term definition");
  }
  if (!meta.termId) {
    warnings.push(
      "glossary-term: missing term_id (recommended for stable links and transclusion)",
    );
  }
  if (!meta.inDefinedTermSet) {
    warnings.push(
      "glossary-term: missing inDefinedTermSet or glossary parent href (recommended)",
    );
  }

  return warnings;
}

function seeAlsoHtml(links: readonly string[], rootPrefix: string): string {
  const anchors = links
    .map((href) => {
      const resolved = href.startsWith("/") || href.startsWith("http") ? href : rootPrefix + href;
      return `<a href="${escapeHtml(resolved)}">${escapeHtml(href)}</a>`;
    })
    .join(", ");
  return `<p class="glossary-see-also"><strong>See also:</strong> ${anchors}</p>`;
}

function parentGlossaryHtml(href: string, rootPrefix: string): string {
  const resolved = href.startsWith("/") || href.startsWith("http") ? href : rootPrefix + href;
  return (
    `<p class="glossary-term-parent">` +
    `<strong>Glossary:</strong> ` +
    `<a href="${escapeHtml(resolved)}">${escapeHtml(href)}</a>` +
    `</p>`
  );
}

/** 単一用語ページの HTML。 */
export function renderGlossaryTermPageBody(
  concept: OkfConcept,
  definitionHtml: string,
  meta: GlossaryTermPageMeta,
  opts?: { readonly rootPrefix?: string },
): string {
  const rootPrefix = opts?.rootPrefix ?? "./";
  const description =
    typeof concept.description === "string" && concept.description.length > 0
      ? `<p class="glossary-term-description">${escapeHtml(concept.description)}</p>`
      : "";
  const language =
    typeof concept.frontmatter.language === "string" &&
    concept.frontmatter.language.length > 0
      ? `<p class="glossary-term-meta"><strong>Language:</strong> <code>${escapeHtml(concept.frontmatter.language)}</code></p>`
      : "";
  const parent =
    meta.inDefinedTermSet && meta.inDefinedTermSet.length > 0
      ? parentGlossaryHtml(meta.inDefinedTermSet, rootPrefix)
      : "";
  const seeAlso =
    meta.seeAlso && meta.seeAlso.length > 0
      ? seeAlsoHtml(meta.seeAlso, rootPrefix)
      : "";
  const idAttr = meta.termId ? ` id="${escapeHtml(meta.termId)}"` : "";

  return (
    `<article class="glossary-term-page">` +
    `<header class="glossary-term-header">` +
    `<h1 class="glossary-term-title">${escapeHtml(concept.title)}</h1>` +
    description +
    language +
    parent +
    `</header>` +
    `<section class="glossary-term"${idAttr}>` +
    `<div class="glossary-definition">${definitionHtml}${seeAlso}</div>` +
    `</section>` +
    `</article>`
  );
}

export function buildGlossaryTermJsonLd(opts: {
  title: string;
  description?: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  siteTitle: string;
  lang: string;
  termId?: string;
  inDefinedTermSet?: string;
  definitionHtml: string;
  definitionMarkdown: string;
  seeAlso?: readonly string[];
  aiDisclosure?: AiDisclosure;
  associatedMedia?: readonly AssociatedMediaItem[];
  organization?: OrganizationSpec;
  frontmatter?: Record<string, unknown>;
}): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: opts.title,
    description:
      plainTextFromHtml(opts.definitionHtml).trim() || opts.description || opts.definitionMarkdown,
    url: opts.url,
    inLanguage: opts.lang,
    isPartOf: { "@type": "WebSite", name: opts.siteTitle },
  };
  if (opts.termId) {
    data["@id"] = `${opts.url.split("#")[0]}#${opts.termId}`;
    data.termCode = opts.termId;
  }
  if (opts.inDefinedTermSet) {
    data.inDefinedTermSet = { "@type": "DefinedTermSet", url: opts.inDefinedTermSet };
  }
  if (opts.description) data.description = opts.description;
  if (opts.datePublished) data.datePublished = opts.datePublished;
  if (opts.dateModified) data.dateModified = opts.dateModified;
  if (opts.author) data.author = { "@type": "Person", name: opts.author };
  if (opts.organization) data.publisher = buildOrganizationNode(opts.organization);
  if (opts.seeAlso && opts.seeAlso.length > 0) data.sameAs = [...opts.seeAlso];
  if (opts.frontmatter) Object.assign(data, creativeWorkFindabilityFields(opts.frontmatter));
  if (opts.aiDisclosure) Object.assign(data, aiDisclosureJsonLdFields(opts.aiDisclosure));
  const mediaFields = associatedMediaJsonLdFields(opts.associatedMedia ?? []);
  if (mediaFields) Object.assign(data, mediaFields);
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export interface GlossaryTermIndexEntry {
  readonly title: string;
  readonly href: string;
  readonly termId?: string;
  readonly parentHref?: string;
  readonly description?: string;
}

/** 用語一覧（タグ一覧風）の HTML。 */
export function renderGlossaryTermIndexBody(
  siteTitle: string,
  entries: readonly GlossaryTermIndexEntry[],
  opts?: { readonly fromRel?: string; readonly lang?: string },
): string {
  const fromRel = opts?.fromRel ?? "glossary/terms/index.html";
  const items = [...entries]
    .sort((a, b) => a.title.localeCompare(b.title, opts?.lang ?? "ja"))
    .map((entry) => {
      const href = relLinkFrom(fromRel, entry.href);
      const parent =
        entry.parentHref && entry.parentHref.length > 0
          ? ` <span class="glossary-term-index-parent">(${escapeHtml(entry.parentHref)})</span>`
          : "";
      const desc =
        entry.description && entry.description.length > 0
          ? `<p class="glossary-term-index-desc">${escapeHtml(entry.description)}</p>`
          : "";
      return (
        `<li class="glossary-term-index-item">` +
        `<a href="${escapeHtml(href)}" class="glossary-term-index-link">${escapeHtml(entry.title)}</a>` +
        `${parent}` +
        `${desc}` +
        `</li>`
      );
    })
    .join("\n");

  const indexTitle = opts?.lang?.startsWith("ja") ? "用語一覧" : "Glossary terms";
  return (
    `<div class="blog-index glossary-term-index">` +
    `<header class="blog-header"><h1>${escapeHtml(siteTitle)} — ${escapeHtml(indexTitle)}</h1></header>` +
    `<ul class="blog-list glossary-term-index-list">${items}</ul>` +
    `</div>`
  );
}

