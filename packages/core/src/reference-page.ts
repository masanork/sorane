import type { OkfConcept } from "@sorane/okf";
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
const GFM_TABLE_ROW_RE = /^\|.+\|$/;
const GFM_TABLE_SEP_RE = /^\|[-:| ]+\|$/;

/** 本文に GFM テーブルがあるか（コードフェンス内は除外）。 */
export function bodyHasGfmTable(body: string): boolean {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";
  for (let i = 0; i < lines.length - 1; i++) {
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
    const a = line.trim();
    const b = lines[i + 1]!.trim();
    if (GFM_TABLE_ROW_RE.test(a) && GFM_TABLE_SEP_RE.test(b)) return true;
  }
  return false;
}

/** `type: reference` 向けの warning。 */
export function validateReferenceWarnings(
  body: string,
  meta: {
    readonly description?: string;
    readonly resource?: string;
    readonly frontmatter: Record<string, unknown>;
  },
): readonly string[] {
  const warnings: string[] = [];
  const description = typeof meta.description === "string" ? meta.description.trim() : "";
  const resource = typeof meta.resource === "string" ? meta.resource.trim() : "";

  if (description.length === 0) {
    warnings.push("reference: missing description (recommended for spec pages)");
  }
  if (resource.length === 0) {
    warnings.push("reference: missing resource URI (recommended for source link)");
  }
  if (body.trim().length === 0) {
    warnings.push("reference: empty body; add tables or field definitions");
  } else if (!bodyHasGfmTable(body)) {
    warnings.push(
      "reference: body has no GFM table; code lists and field enums often use tables",
    );
  }

  const identifier = meta.frontmatter.identifier;
  if (
    typeof identifier === "string" &&
    identifier.length > 0 &&
    resource.length > 0 &&
    identifier === resource
  ) {
    warnings.push(
      "reference: identifier matches resource; use identifier for this page and resource for the external source",
    );
  }

  return warnings;
}

function referenceMetaHtml(concept: OkfConcept): string {
  const meta: string[] = [];
  if (concept.resource) {
    meta.push(
      `<p class="reference-meta"><strong>Source:</strong> <a href="${escapeHtml(concept.resource)}">${escapeHtml(concept.resource)}</a></p>`,
    );
  }
  const identifier = concept.frontmatter.identifier;
  if (typeof identifier === "string" && identifier.length > 0) {
    meta.push(
      `<p class="reference-meta"><strong>Identifier:</strong> <code>${escapeHtml(identifier)}</code></p>`,
    );
  }
  const language = concept.frontmatter.language;
  if (typeof language === "string" && language.length > 0) {
    meta.push(
      `<p class="reference-meta"><strong>Language:</strong> <code>${escapeHtml(language)}</code></p>`,
    );
  }
  if (meta.length === 0) return "";
  return `<div class="reference-meta-block">${meta.join("")}</div>`;
}

/** Reference ランディング: メタデータ + 本文（表向け）。 */
export function renderReferencePageBody(concept: OkfConcept, bodyHtml: string): string {
  const description =
    typeof concept.description === "string" && concept.description.length > 0
      ? `<p class="reference-description">${escapeHtml(concept.description)}</p>`
      : "";

  return (
    `<article class="reference-page">` +
    `<header class="reference-header">` +
    `<h1>${escapeHtml(concept.title)}</h1>` +
    description +
    referenceMetaHtml(concept) +
    `</header>` +
    `<div class="reference-body">${bodyHtml}</div>` +
    `</article>`
  );
}

export function buildReferencePageJsonLd(opts: {
  title: string;
  description?: string;
  url: string;
  resource?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  siteTitle: string;
  lang: string;
  tags?: readonly string[];
  aiDisclosure?: AiDisclosure;
  associatedMedia?: readonly AssociatedMediaItem[];
  organization?: OrganizationSpec;
  frontmatter?: Record<string, unknown>;
}): string {
  const keywords = ["reference", ...(opts.tags ?? [])];
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: opts.title,
    name: opts.title,
    url: opts.url,
    inLanguage: opts.lang,
    isPartOf: { "@type": "WebSite", name: opts.siteTitle },
    keywords,
    genre: "reference",
  };
  if (opts.description) data.description = opts.description;
  if (opts.datePublished) data.datePublished = opts.datePublished;
  if (opts.dateModified) data.dateModified = opts.dateModified;
  if (opts.author) {
    data.author = { "@type": "Person", name: opts.author };
  }
  if (opts.resource) {
    data.isBasedOn = {
      "@type": "CreativeWork",
      url: opts.resource,
      name: opts.title,
    };
    data.citation = opts.resource;
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