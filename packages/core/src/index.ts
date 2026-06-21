export { runBuild, type BuildOptions, type BuildResult } from "./build.ts";
export {
  exportMarkdownBodyToDocx,
  runDocxExport,
  type ExportDocxBodyOptions,
  type RunDocxExportOptions,
  type RunDocxExportResult,
} from "./export/docx.ts";
export { pandocCliAvailable, resolvePandocBinary } from "./export/pandoc-cli.ts";
export {
  mergeConfig,
  DEFAULT_CONFIG,
  resolvePermalink,
  type SoraneConfig,
  type OkfConfig,
  type UnknownTypePolicy,
} from "./config.ts";
export { normalizeOkfConfig, okfValidateOptions } from "./okf-config.ts";
export { migrateToOkf, parseBumpProfileArg, type MigrateToOkfOptions } from "./migrate.ts";
export { validateHeadingWarnings } from "./validate-heading-structure.ts";
export {
  validateSiteContent,
  VALIDATE_JSON_SCHEMA_VERSION,
  type ValidateSiteReport,
  type ValidateFileReport,
  type ValidateFinding,
} from "./validate-site.ts";
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
export { buildCatalogDcatJsonLd, hasDcatCatalogDatasets } from "./catalog-dcat.ts";
export {
  buildRobotsTxt,
  buildSitemapXml,
  buildLlmsTxt,
  type SiteEntry,
} from "./site-meta.ts";
export {
  buildBreadcrumbJsonLd,
  creativeWorkFindabilityFields,
  organizationFromSite,
  resolveSitemapLastmod,
  type OrganizationSpec,
} from "./findability.ts";
export { validateDiagramAltWarnings } from "./diagrams/validate-diagram-alt.ts";
export { resolveOgImageUrl, ogLocaleFromLang } from "./og-meta.ts";
export {
  resolveI18nContext,
  resolvePageLocaleInfo,
  hreflangAlternatesForPage,
  type I18nContext,
  type SiteI18nConfig,
} from "./i18n.ts";
export {
  resolveEmergencyBanner,
  emergencyBannerHtml,
  type SiteEmergencyConfig,
} from "./emergency-banner.ts";
export {
  parseRevisionHistory,
  revisionHistoryHtml,
  validateRevisionFindings,
  type RevisionEntry,
} from "./revision-history.ts";
export {
  buildCloudflareOpsManifest,
  llmsHostingSection,
  isCloudflareHostingEnabled,
  RECOMMENDED_LOGPUSH_FIELDS,
  CLOUDFLARE_OPS_SCHEMA_VERSION,
  type CloudflareOpsManifest,
  type SiteHostingConfig,
} from "./hosting-cloudflare.ts";