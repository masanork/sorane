import type { OkfConcept } from "@sorane/okf";

export interface CatalogEntry {
  readonly slug: string;
  readonly url: string;
  readonly concept: OkfConcept;
}

export function buildCatalogJsonLd(
  entries: readonly CatalogEntry[],
  siteTitle: string,
  baseUrl: string,
): string {
  const graph = entries.map((e) => {
    const dataset: Record<string, unknown> = {
      "@type": "Dataset",
      "@id": e.url,
      name: e.concept.title,
      keywords: [e.concept.type, ...(e.concept.tags ?? [])],
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "text/markdown",
          contentUrl: `${e.url.replace(/\.html$/, ".md")}`,
        },
      ],
    };
    if (e.concept.description) dataset.description = e.concept.description;
    if (e.concept.timestamp) dataset.dateModified = e.concept.timestamp;
    return dataset;
  });

  const catalog = {
    "@context": {
      "@vocab": "https://schema.org/",
      dcat: "http://www.w3.org/ns/dcat#",
    },
    "@type": "DataCatalog",
    name: siteTitle,
    url: baseUrl.length > 0 ? baseUrl : undefined,
    dataset: graph,
  };

  return JSON.stringify(catalog, null, 2) + "\n";
}