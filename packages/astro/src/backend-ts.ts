import {
  buildCatalogDcatJsonLd,
  buildCatalogJsonLd,
  buildLlmsTxt,
  buildSitemapXml,
  hasDcatCatalogDatasets,
  type CatalogEntry,
  type SiteEntry,
} from "@sorane/core";
import { ASTRO_LLMS_EXTRA_SECTIONS } from "./artifact-copy.ts";
import { buildOkfBundle, resolveEffectiveType } from "@sorane/okf";
import {
  SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
  type SoraneAstroBackendArtifact,
  type SoraneAstroBackendInput,
  type SoraneAstroBackendOutput,
  type SoraneAstroBackendOutputsInput,
} from "./contract.ts";
import { hasAiDisclosure, isAstroOkfContent, parseBackendFiles, slugForParsed } from "./content.ts";
import { absoluteUrl, htmlRelForContent } from "./routes.ts";
import { collectBackendValidation } from "./validation.ts";

function defaultOutputs(
  outputs: SoraneAstroBackendOutputsInput | undefined,
): Required<SoraneAstroBackendOutputsInput> {
  return {
    catalog: outputs?.catalog ?? true,
    llmsTxt: outputs?.llmsTxt ?? true,
    okfBundle: outputs?.okfBundle ?? true,
    sitemap: outputs?.sitemap ?? false,
    dcatCatalog: outputs?.dcatCatalog ?? false,
  };
}

/** TypeScript backend: deterministic OKF semantics over the JSON contract. */
export async function runSoraneAstroTsBackend(
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendOutput> {
  const outputs = defaultOutputs(input.outputs);
  const routeOpts = {
    permalink: input.permalink,
    collections: input.collections,
  };
  const allParsed = parseBackendFiles(input.files);
  const parsed = allParsed.filter(isAstroOkfContent);
  const validation = collectBackendValidation(input, input.validate ?? "warn");

  const catalogEntries: CatalogEntry[] = parsed.map((p) => {
    const urlRel = htmlRelForContent(p.relPath, routeOpts);
    return {
      slug: slugForParsed(p),
      url: absoluteUrl(input.site.baseUrl ?? "", urlRel),
      concept: p.concept,
    };
  });

  const artifacts: SoraneAstroBackendArtifact[] = [];

  if (outputs.catalog) {
    artifacts.push({
      path: "catalog.jsonld",
      kind: "text",
      content: buildCatalogJsonLd(
        catalogEntries,
        input.site.title,
        input.site.baseUrl ?? "",
      ),
    });
  }

  if (outputs.llmsTxt) {
    artifacts.push({
      path: "llms.txt",
      kind: "text",
      content: buildLlmsTxt({
        siteTitle: input.site.title,
        siteDescription: input.site.description,
        baseUrl: input.site.baseUrl ?? "",
        aiLabeledCount: parsed.filter(hasAiDisclosure).length,
        dcatCatalog: outputs.dcatCatalog && hasDcatCatalogDatasets(catalogEntries),
        extraSections: [...ASTRO_LLMS_EXTRA_SECTIONS],
      }),
    });
  }

  if (outputs.dcatCatalog && hasDcatCatalogDatasets(catalogEntries)) {
    const dcat = buildCatalogDcatJsonLd(
      catalogEntries,
      input.site.title,
      input.site.baseUrl ?? "",
      {
        siteDescription: input.site.description,
        defaultLicense: input.openData?.defaultLicense,
      },
    );
    if (dcat) {
      artifacts.push({
        path: "catalog-dcat.jsonld",
        kind: "text",
        content: dcat,
      });
    }
  }

  if (outputs.okfBundle) {
    const bundle = await buildOkfBundle(
      parsed.map((p) => ({ concept: p.concept, slug: slugForParsed(p) })),
    );
    artifacts.push({
      path: "okf/bundle.tar.gz",
      kind: "base64",
      content: bundle.toString("base64"),
    });
  }

  if (outputs.sitemap) {
    const siteEntries: SiteEntry[] = catalogEntries.map((e) => ({
      url: e.url.startsWith("http")
        ? e.url.replace(`${input.site.baseUrl ?? ""}/`, "")
        : e.url,
      isIndex: resolveEffectiveType(e.concept.type, e.concept.profile) === "index",
      lastmod: e.concept.timestamp,
    }));
    artifacts.push({
      path: "sitemap.xml",
      kind: "text",
      content: buildSitemapXml(siteEntries, input.site.baseUrl ?? ""),
    });
  }

  return {
    schema_version: SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
    concepts: parsed.length,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    validationDetails: validation.details,
    artifacts,
  };
}