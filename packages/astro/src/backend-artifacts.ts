import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAtomFeed,
  buildCatalogDcatJsonLd,
  buildCatalogJsonLd,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  hasDcatCatalogDatasets,
  type CatalogEntry,
  type FeedEntry,
  type SiteEntry,
} from "@sorane/core";
import {
  buildOkfBundle,
  conceptToOkfMarkdown,
  packOkfcFromIr,
  buildKnowledgeIr,
  resolveEffectiveType,
  type ParsedConcept,
} from "@sorane/okf";
import { ASTRO_LLMS_EXTRA_SECTIONS } from "./artifact-copy.ts";
import type {
  SoraneAstroBackendArtifact,
  SoraneAstroBackendInput,
  SoraneAstroBackendOutputsInput,
} from "./contract.ts";
import { hasAiDisclosure, isAstroOkfContent, parseBackendFiles, slugForParsed } from "./content.ts";
import { buildSearchArtifacts } from "./search-backend.ts";
import { absoluteUrl, htmlRelForContent, mdRelForHtml } from "./routes.ts";

export type ResolvedAstroOutputs = Required<SoraneAstroBackendOutputsInput>;

/** Publishing defaults aligned with `preset: okf-site` agent outputs (not full HTML SSG). */
export function defaultBackendOutputs(
  outputs: SoraneAstroBackendOutputsInput | undefined,
): ResolvedAstroOutputs {
  return {
    catalog: outputs?.catalog ?? true,
    llmsTxt: outputs?.llmsTxt ?? true,
    okfBundle: outputs?.okfBundle ?? true,
    okfc: outputs?.okfc ?? true,
    sitemap: outputs?.sitemap ?? false,
    feed: outputs?.feed ?? true,
    robots: outputs?.robots ?? true,
    mdAlternate: outputs?.mdAlternate ?? true,
    dcatCatalog: outputs?.dcatCatalog ?? false,
    search: outputs?.search ?? false,
  };
}

export function catalogEntriesFromParsed(
  parsed: readonly ParsedConcept[],
  input: SoraneAstroBackendInput,
): CatalogEntry[] {
  const routeOpts = {
    permalink: input.permalink,
    collections: input.collections,
  };
  return parsed.map((p) => {
    const urlRel = htmlRelForContent(p.relPath, routeOpts);
    return {
      slug: slugForParsed(p),
      url: absoluteUrl(input.site.baseUrl ?? "", urlRel),
      concept: p.concept,
    };
  });
}

function isPublicBundleConcept(p: ParsedConcept): boolean {
  const effective = resolveEffectiveType(p.concept.type, p.concept.profile);
  if (effective === "index") return false;
  if (slugForParsed(p) === "index") return false;
  const base = p.relPath.replace(/\\/g, "/").split("/").pop() ?? "";
  if (/^404\.(md|mdx)$/i.test(base)) return false;
  // draft: true = prepare content without publishing (same gate as core build / OKFC)
  if (p.concept.frontmatter.draft === true) return false;
  return true;
}

function articleFeedEntries(
  parsed: readonly ParsedConcept[],
  input: SoraneAstroBackendInput,
): FeedEntry[] {
  const routeOpts = {
    permalink: input.permalink,
    collections: input.collections,
  };
  const baseUrl = (input.site.baseUrl ?? "").replace(/\/$/, "");
  return parsed
    .filter((p) => resolveEffectiveType(p.concept.type, p.concept.profile) === "article")
    .map((p) => {
      const href = htmlRelForContent(p.relPath, routeOpts);
      const absUrl = absoluteUrl(baseUrl, href);
      const ts = p.concept.timestamp ?? new Date().toISOString();
      const digital =
        typeof p.concept.frontmatter.digitalSourceType === "string"
          ? String(p.concept.frontmatter.digitalSourceType)
          : undefined;
      return {
        title: p.concept.title,
        url: absUrl,
        id: absUrl,
        updated: ts.includes("T") ? ts : `${ts}T00:00:00Z`,
        summary: p.concept.description,
        digitalSourceCode: digital,
      };
    })
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0))
    .slice(0, 30);
}

async function buildOkfcArtifacts(
  parsed: readonly ParsedConcept[],
  input: SoraneAstroBackendInput,
): Promise<SoraneAstroBackendArtifact[]> {
  const concepts = parsed.filter(isPublicBundleConcept).map((p) => ({
    concept: p.concept,
    slug: slugForParsed(p),
  }));
  const dir = mkdtempSync(join(tmpdir(), "sorane-astro-okfc-"));
  const dbPath = join(dir, "site.okfc");
  const out: SoraneAstroBackendArtifact[] = [];
  try {
    const { buildOkfcRegistry, okfcRegistryToJson } = await import("@sorane/okf");
    const ir = buildKnowledgeIr(concepts);
    const result = await packOkfcFromIr({
      dbPath,
      ir,
      meta: {
        bundle_id: input.site.baseUrl || input.site.title || "site",
        title: input.site.title,
        description: input.site.description,
        bundle_type: "site",
        bundle_uri: input.site.baseUrl || undefined,
        pack_tool: "tool:sorane/astro-okfc-pack@0.5",
      },
      fresh: true,
    });
    out.push({
      path: "okf/site.okfc",
      kind: "base64",
      content: readFileSync(dbPath).toString("base64"),
    });
    const registry = buildOkfcRegistry([
      {
        id: "site",
        path: "okf/site.okfc",
        title: input.site.title,
        description: input.site.description,
        bundle_type: "site",
        bundle_uri: input.site.baseUrl || undefined,
        concept_count: result.conceptCount,
        chunk_count: result.chunkCount,
        packed_at: result.packedAt,
        search: result.search,
      },
    ]);
    out.push({
      path: "okf/registry.json",
      kind: "text",
      content: okfcRegistryToJson(registry),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[sorane/astro] OKFC pack failed: ${msg}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

/**
 * OKF markdown alternates under `okf/md/…` (not beside HTML).
 * Avoids collisions when Astro content ids keep the `.md` suffix
 * (e.g. route `blog/hello.md/index.html`).
 */
function mdAlternateArtifacts(
  parsed: readonly ParsedConcept[],
  input: SoraneAstroBackendInput,
): SoraneAstroBackendArtifact[] {
  const routeOpts = {
    permalink: input.permalink,
    collections: input.collections,
  };
  const out: SoraneAstroBackendArtifact[] = [];
  for (const p of parsed) {
    if (!isAstroOkfContent(p)) continue;
    const htmlRel = htmlRelForContent(p.relPath, routeOpts);
    const mdRel = mdRelForHtml(htmlRel);
    out.push({
      path: `okf/md/${mdRel}`,
      kind: "text",
      content: conceptToOkfMarkdown(p.concept),
    });
  }
  return out;
}

export async function buildOkfArtifacts(
  input: SoraneAstroBackendInput,
  parsed: readonly ParsedConcept[],
): Promise<SoraneAstroBackendArtifact[]> {
  const outputs = defaultBackendOutputs(input.outputs);
  const catalogEntries = catalogEntriesFromParsed(parsed, input);
  const artifacts: SoraneAstroBackendArtifact[] = [];
  const baseUrl = input.site.baseUrl ?? "";

  if (outputs.catalog) {
    artifacts.push({
      path: "catalog.jsonld",
      kind: "text",
      content: buildCatalogJsonLd(
        catalogEntries,
        input.site.title,
        baseUrl,
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
        baseUrl,
        aiLabeledCount: parsed.filter(hasAiDisclosure).length,
        dcatCatalog: outputs.dcatCatalog && hasDcatCatalogDatasets(catalogEntries),
        okfc: outputs.okfc,
        extraSections: [...ASTRO_LLMS_EXTRA_SECTIONS],
      }),
    });
  }

  if (outputs.dcatCatalog && hasDcatCatalogDatasets(catalogEntries)) {
    const dcat = buildCatalogDcatJsonLd(
      catalogEntries,
      input.site.title,
      baseUrl,
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
      parsed.filter(isPublicBundleConcept).map((p) => ({
        concept: p.concept,
        slug: slugForParsed(p),
      })),
    );
    artifacts.push({
      path: "okf/bundle.tar.gz",
      kind: "base64",
      content: bundle.toString("base64"),
    });
  }

  if (outputs.okfc) {
    artifacts.push(...(await buildOkfcArtifacts(parsed, input)));
  }

  if (outputs.sitemap) {
    const siteEntries: SiteEntry[] = catalogEntries.map((e) => ({
      url: e.url.startsWith("http")
        ? e.url.replace(`${baseUrl}/`, "").replace(baseUrl, "")
        : e.url,
      isIndex: resolveEffectiveType(e.concept.type, e.concept.profile) === "index",
      lastmod: e.concept.timestamp,
    }));
    artifacts.push({
      path: "sitemap.xml",
      kind: "text",
      content: buildSitemapXml(siteEntries, baseUrl),
    });
  }

  if (outputs.feed) {
    artifacts.push({
      path: "feed.xml",
      kind: "text",
      content: buildAtomFeed(articleFeedEntries(parsed, input), {
        siteTitle: input.site.title,
        siteDescription: input.site.description,
        baseUrl,
      }),
    });
  }

  if (outputs.robots) {
    artifacts.push({
      path: "robots.txt",
      kind: "text",
      content: buildRobotsTxt(baseUrl),
    });
  }

  if (outputs.mdAlternate) {
    artifacts.push(...mdAlternateArtifacts(parsed, input));
  }

  return artifacts;
}

/**
 * When native/WASM backends omit newer publishing outputs, fill them from TypeScript.
 * Prefer existing backend artifacts for paths already present (except refresh llms when okfc).
 */
export async function mergePublishingArtifacts(
  input: SoraneAstroBackendInput,
  existing: readonly SoraneAstroBackendArtifact[],
): Promise<SoraneAstroBackendArtifact[]> {
  const parsed = parseBackendFiles(input.files).filter(isAstroOkfContent);
  const wanted = await buildOkfArtifacts(input, parsed);
  const byPath = new Map<string, SoraneAstroBackendArtifact>();
  for (const a of existing) byPath.set(a.path, a);

  const outputs = defaultBackendOutputs(input.outputs);
  for (const a of wanted) {
    const isLlmsWithOkfc = a.path === "llms.txt" && outputs.okfc && outputs.llmsTxt;
    if (!byPath.has(a.path) || isLlmsWithOkfc) {
      byPath.set(a.path, a);
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Build all artifact-backend outputs (OKF + optional search). No validation. */
export async function buildSoraneAstroArtifacts(
  input: SoraneAstroBackendInput,
): Promise<{ concepts: number; artifacts: SoraneAstroBackendArtifact[] }> {
  const parsed = parseBackendFiles(input.files).filter(isAstroOkfContent);
  const artifacts = await buildOkfArtifacts(input, parsed);

  if (input.outputs?.search || defaultBackendOutputs(input.outputs).search) {
    if (input.outputs?.search) {
      artifacts.push(...(await buildSearchArtifacts(input)));
    }
  }

  return { concepts: parsed.length, artifacts };
}

/** @deprecated Prefer `buildSoraneAstroArtifacts`. Kept for parity tests and TS fallback CI. */
export const buildSoraneAstroTsArtifacts = buildSoraneAstroArtifacts;
