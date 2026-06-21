import { isDatasetCatalogEntry } from "./creative-work-type.ts";
import type { CatalogEntry, CatalogPublisher } from "./catalog.ts";
import {
  parseDistributions,
  parsePublisher,
  resolveDistributionUrl,
  resolveLicenseUrl,
  resolveMediaType,
} from "./open-data.ts";

const DCAT_CONTEXT = {
  dcat: "http://www.w3.org/ns/dcat#",
  dct: "http://purl.org/dc/terms/",
  foaf: "http://xmlns.com/foaf/0.1/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
} as const;

function foafAgent(
  name: string,
  opts?: { readonly url?: string; readonly email?: string },
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "foaf:Agent",
    "foaf:name": name,
  };
  if (opts?.url) node["foaf:homepage"] = opts.url;
  if (opts?.email) node["foaf:mbox"] = `mailto:${opts.email}`;
  return node;
}

function dcatDistribution(
  dist: ReturnType<typeof parseDistributions>[number],
  pageUrl: string,
  baseUrl: string,
): Record<string, unknown> {
  const accessUrl = resolveDistributionUrl(dist.accessURL, baseUrl, pageUrl);
  const downloadUrl =
    dist.downloadURL !== undefined
      ? resolveDistributionUrl(dist.downloadURL, baseUrl, pageUrl)
      : accessUrl;
  const node: Record<string, unknown> = {
    "@type": "dcat:Distribution",
    "dct:title": dist.title,
    "dcat:accessURL": { "@id": accessUrl },
    "dcat:downloadURL": { "@id": downloadUrl },
    "dct:format": dist.format,
    "dcat:mediaType": resolveMediaType(dist.format),
  };
  if (dist.byteSize !== undefined) node["dcat:byteSize"] = dist.byteSize;
  if (dist.checksum) node["dct:conformsTo"] = dist.checksum;
  return node;
}

function buildDcatDatasetNode(
  entry: CatalogEntry,
  baseUrl: string,
  defaultLicense?: string,
): Record<string, unknown> {
  const concept = entry.concept;
  const node: Record<string, unknown> = {
    "@type": "dcat:Dataset",
    "@id": entry.url,
    "dct:title": concept.title,
  };
  if (concept.description) node["dct:description"] = concept.description;

  const identifier = concept.frontmatter.identifier;
  if (typeof identifier === "string" && identifier.length > 0) {
    node["dct:identifier"] = identifier;
  }
  if (concept.resource) {
    node["dct:source"] = concept.resource;
  }

  const language = concept.frontmatter.language;
  if (typeof language === "string" && language.length > 0) {
    node["dct:language"] = language;
  }

  const theme = concept.frontmatter.theme;
  if (typeof theme === "string" && theme.length > 0) {
    node["dcat:theme"] = theme;
  }

  const licenseRaw =
    (typeof concept.frontmatter.license === "string" && concept.frontmatter.license.length > 0
      ? concept.frontmatter.license
      : undefined) ?? defaultLicense;
  if (licenseRaw) {
    node["dct:license"] = { "@id": resolveLicenseUrl(licenseRaw) };
  }

  const temporal = concept.frontmatter.temporal;
  if (temporal !== null && typeof temporal === "object" && !Array.isArray(temporal)) {
    const start = (temporal as { start?: unknown }).start;
    const end = (temporal as { end?: unknown }).end;
    if (typeof start === "string" && start.length > 0) {
      node["dct:temporal"] = end && typeof end === "string" && end.length > 0
        ? `${start}/${end}`
        : start;
    }
  }

  const spatial = concept.frontmatter.spatial;
  if (typeof spatial === "string" && spatial.length > 0) {
    node["dct:spatial"] = spatial;
  }

  if (concept.timestamp) {
    node["dct:issued"] = concept.timestamp;
    node["dct:modified"] = concept.timestamp;
  }
  const updated = concept.frontmatter.updated;
  if (typeof updated === "string" && updated.length > 0) {
    node["dct:modified"] = updated;
  }

  const publisher = parsePublisher(concept.frontmatter.publisher);
  if (publisher) {
    node["dct:publisher"] = foafAgent(publisher.name, {
      url: publisher.url,
      email: publisher.email,
    });
  }

  const distributions = parseDistributions(concept.frontmatter.distributions);
  if (distributions.length > 0) {
    node["dcat:distribution"] = distributions.map((d) =>
      dcatDistribution(d, entry.url, baseUrl),
    );
  }

  const keywords = concept.tags ?? [];
  if (keywords.length > 0) node["dct:subject"] = [...keywords];

  return node;
}

export interface BuildCatalogDcatOptions {
  readonly siteDescription?: string;
  readonly publisher?: CatalogPublisher;
  readonly defaultLicense?: string;
}

/**
 * DCAT-AP shaped JSON-LD for dataset pages only (`catalog-dcat.jsonld`).
 * Returns `null` when there are no `type: dataset` entries.
 */
export function buildCatalogDcatJsonLd(
  entries: readonly CatalogEntry[],
  siteTitle: string,
  baseUrl: string,
  opts?: BuildCatalogDcatOptions,
): string | null {
  const datasetEntries = entries.filter((e) => isDatasetCatalogEntry(e.concept));
  if (datasetEntries.length === 0) return null;

  const catalog: Record<string, unknown> = {
    "@context": DCAT_CONTEXT,
    "@type": "dcat:Catalog",
    "dct:title": siteTitle,
  };
  if (opts?.siteDescription) catalog["dct:description"] = opts.siteDescription;
  if (baseUrl.length > 0) catalog["dct:identifier"] = baseUrl;

  const pub = opts?.publisher;
  if (pub) {
    catalog["dct:publisher"] = foafAgent(pub.name, { url: pub.url });
  }

  catalog["dcat:dataset"] = datasetEntries.map((e) =>
    buildDcatDatasetNode(e, baseUrl, opts?.defaultLicense),
  );

  return JSON.stringify(catalog, null, 2) + "\n";
}

export function hasDcatCatalogDatasets(entries: readonly CatalogEntry[]): boolean {
  return entries.some((e) => isDatasetCatalogEntry(e.concept));
}