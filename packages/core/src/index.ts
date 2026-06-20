export { runBuild, type BuildOptions, type BuildResult } from "./build.ts";
export { mergeConfig, DEFAULT_CONFIG, resolvePermalink, type SoraneConfig } from "./config.ts";
export { migrateToOkf, parseBumpProfileArg, type MigrateToOkfOptions } from "./migrate.ts";
export { validateHeadingWarnings } from "./validate-heading-structure.ts";
export { processStaticAssets, type StaticAssetPassResult } from "./static-assets.ts";
export {
  signRasterWithC2pa,
  probeC2paManifest,
  c2patoolAvailable,
  resolveC2paCredentials,
  isC2paRasterPath,
} from "./c2pa-pass.ts";
export {
  loadAssetProvenance,
  resolveC2paCreateIntent,
  type AssetProvenanceEntry,
} from "./asset-provenance.ts";
export {
  buildPage,
  extractDescription,
  renderArticleBody,
  renderIndexBody,
  rootPrefixFromRel,
  relLinkFrom,
  buildSearchMount,
  buildSearchHead,
  isSearchView,
  sanitizeListDescription,
  articleFontClass,
  renderFeaturedExcerpt,
  buildWebSiteJsonLd,
} from "./ssg.ts";
export { siteLabels, type SiteLabels } from "./site-labels.ts";
export type { FeaturedMode } from "./config.ts";
export {
  renderMarkdown,
  rewriteLinks,
  escapeHtml,
  stripDuplicateTitleHeading,
} from "./render.ts";
export { buildCatalogJsonLd, type CatalogEntry } from "./catalog.ts";
export {
  buildRobotsTxt,
  buildSitemapXml,
  buildLlmsTxt,
  type SiteEntry,
} from "./site-meta.ts";
export { validateDiagramAltWarnings } from "./diagrams/validate-diagram-alt.ts";
export { resolveOgImageUrl, ogLocaleFromLang } from "./og-meta.ts";