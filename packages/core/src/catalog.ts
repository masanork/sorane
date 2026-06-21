import type { OkfConcept } from "@sorane/okf";
import { resolveEffectiveType } from "@sorane/okf";
import { parseAiDisclosure } from "./ai-disclosure.ts";
import {
  isDatasetCatalogEntry,
  resolveCatalogCreativeWorkType,
} from "./creative-work-type.ts";
import {
  parseDistributions,
  parsePublisher,
  resolveDistributionUrl,
  resolveLicenseUrl,
  resolveMediaType,
} from "./open-data.ts";

export interface CatalogEntry {
  readonly slug: string;
  readonly url: string;
  readonly concept: OkfConcept;
}

export interface CatalogPublisher {
  readonly name: string;
  readonly url?: string;
}

export interface BuildCatalogOptions {
  readonly machineReadable?: boolean;
  readonly docsMode?: boolean;
  readonly publisher?: CatalogPublisher;
}

function markdownDistribution(pageUrl: string): Record<string, unknown> {
  return {
    "@type": "DataDownload",
    encodingFormat: "text/markdown",
    contentUrl: pageUrl.replace(/\.html$/, ".md"),
  };
}

function applyAiDisclosure(
  target: Record<string, unknown>,
  concept: OkfConcept,
  machineReadable: boolean,
): void {
  const disclosure = machineReadable ? parseAiDisclosure(concept.frontmatter) : null;
  if (!disclosure) return;
  target.digitalSourceType = disclosure.digitalSourceType;
  if (disclosure.systems?.length) {
    const kw = (target.keywords as string[] | undefined) ?? [];
    target.keywords = [
      ...kw,
      ...disclosure.systems.map((s) => `ai-system:${s.name}`),
    ];
  }
}

function buildDatasetNode(
  e: CatalogEntry,
  machineReadable: boolean,
): Record<string, unknown> {
  const concept = e.concept;
  const dataset: Record<string, unknown> = {
    "@type": "Dataset",
    "@id": e.url,
    name: concept.title,
    keywords: [resolveEffectiveType(concept.type, concept.profile), ...(concept.tags ?? [])],
  };
  if (concept.description) dataset.description = concept.description;
  if (concept.timestamp) dataset.dateModified = concept.timestamp;
  if (concept.resource) dataset.url = concept.resource;

  const identifier = concept.frontmatter.identifier;
  if (typeof identifier === "string" && identifier.length > 0) {
    dataset.identifier = identifier;
  }
  const language = concept.frontmatter.language;
  if (typeof language === "string" && language.length > 0) {
    dataset.inLanguage = language;
  }
  const theme = concept.frontmatter.theme;
  if (typeof theme === "string" && theme.length > 0) {
    const kw = (dataset.keywords as string[]) ?? [];
    dataset.keywords = [...kw, `theme:${theme}`];
  }

  const licenseRaw = concept.frontmatter.license;
  if (typeof licenseRaw === "string" && licenseRaw.length > 0) {
    dataset.license = resolveLicenseUrl(licenseRaw);
  }

  const publisher = parsePublisher(concept.frontmatter.publisher);
  if (publisher) {
    const org: Record<string, unknown> = {
      "@type": "Organization",
      name: publisher.name,
    };
    if (publisher.url) org.url = publisher.url;
    dataset.publisher = org;
  }

  const distributions = parseDistributions(concept.frontmatter.distributions);
  const downloads: Record<string, unknown>[] = distributions.map((d) => {
    const contentUrl = resolveDistributionUrl(d.accessURL, "", e.url);
    const node: Record<string, unknown> = {
      "@type": "DataDownload",
      name: d.title,
      encodingFormat: resolveMediaType(d.format),
      contentUrl,
    };
    if (d.byteSize !== undefined) node.contentSize = d.byteSize;
    return node;
  });
  downloads.push(markdownDistribution(e.url));
  dataset.distribution = downloads;

  applyAiDisclosure(dataset, concept, machineReadable);
  return dataset;
}

function buildCreativeWorkNode(
  e: CatalogEntry,
  docsMode: boolean,
  machineReadable: boolean,
): Record<string, unknown> {
  const workType = resolveCatalogCreativeWorkType(e.concept, docsMode);
  const node: Record<string, unknown> = {
    "@type": workType,
    "@id": e.url,
    name: e.concept.title,
    keywords: [
      resolveEffectiveType(e.concept.type, e.concept.profile),
      ...(e.concept.tags ?? []),
    ],
    distribution: [markdownDistribution(e.url)],
  };
  if (e.concept.description) node.description = e.concept.description;
  if (e.concept.timestamp) node.dateModified = e.concept.timestamp;
  if (e.concept.resource) node.url = e.concept.resource;
  applyAiDisclosure(node, e.concept, machineReadable);
  return node;
}

export function buildCatalogJsonLd(
  entries: readonly CatalogEntry[],
  siteTitle: string,
  baseUrl: string,
  opts?: BuildCatalogOptions,
): string {
  const machineReadable = opts?.machineReadable !== false;
  const docsMode = opts?.docsMode === true;

  const datasets: Record<string, unknown>[] = [];
  const hasPart: Record<string, unknown>[] = [];

  for (const e of entries) {
    if (isDatasetCatalogEntry(e.concept)) {
      datasets.push(buildDatasetNode(e, machineReadable));
    } else {
      const effective = resolveEffectiveType(e.concept.type, e.concept.profile);
      if (effective === "index") continue;
      hasPart.push(buildCreativeWorkNode(e, docsMode, machineReadable));
    }
  }

  const catalog: Record<string, unknown> = {
    "@context": {
      "@vocab": "https://schema.org/",
      dcat: "http://www.w3.org/ns/dcat#",
    },
    "@type": "DataCatalog",
    name: siteTitle,
    url: baseUrl.length > 0 ? baseUrl : undefined,
  };

  if (opts?.publisher) {
    const org: Record<string, unknown> = {
      "@type": "Organization",
      name: opts.publisher.name,
    };
    if (opts.publisher.url) org.url = opts.publisher.url;
    catalog.publisher = org;
  }

  if (datasets.length > 0) catalog.dataset = datasets;
  if (hasPart.length > 0) catalog.hasPart = hasPart;

  return JSON.stringify(catalog, null, 2) + "\n";
}

/** Per-page Dataset JSON-LD (`<script>` HTML). */
export function buildDatasetPageJsonLd(
  entry: CatalogEntry,
  machineReadable = true,
): string {
  const node = buildDatasetNode(entry, machineReadable);
  node["@context"] = "https://schema.org";
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}