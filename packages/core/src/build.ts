import { plainTextFromHtml } from "./plain-text.ts";
import {
  collectAllRedirectRules,
  formatRedirectsFile,
  isRedirectPage,
} from "./redirects.ts";
import { resolveBuildOutputs } from "./presets.ts";
import {
  parseConcept,
  buildBundleEntries,
  isBuildableContentType,
  resolveEffectiveType,
  type ParsedConcept,
} from "@sorane/okf";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join, relative, resolve } from "node:path";
import {
  buildAiBadgeHtml,
  parseAiDisclosure,
  resolveAiDisclosureFlags,
} from "./ai-disclosure.ts";
import { buildCatalogDcatJsonLd } from "./catalog-dcat.ts";
import { buildCatalogJsonLd, buildDatasetPageJsonLd } from "./catalog.ts";
import { resolveCatalogCreativeWorkType } from "./creative-work-type.ts";
import { renderDatasetPageBody } from "./dataset-page.ts";
import {
  buildFaqPageJsonLd,
  parseFaqBody,
  renderFaqPageBody,
} from "./faq-page.ts";
import {
  buildGlossaryPageJsonLd,
  resolveGlossaryTerms,
  renderGlossaryPageBody,
} from "./glossary-page.ts";
import {
  buildGlossaryTermJsonLd,
  renderGlossaryTermIndexBody,
  renderGlossaryTermPageBody,
  resolveGlossaryTermMeta,
  type GlossaryTermIndexEntry,
} from "./glossary-term-page.ts";
import { buildGlossaryLinkIndex } from "./markup/glossary-link-index.ts";
import {
  discoverDirectoryIndexes,
  directoryIndexBundlePath,
  directoryIndexOkfMarkdown,
  directoryIndexOutRel,
  humanizeDirectoryLabel,
  renderDirectoryIndexBody,
} from "./directory-index.ts";
import { rubyCharsetExtraFromBody } from "./ruby/ruby-font-extra.ts";
import {
  buildReferencePageJsonLd,
  renderReferencePageBody,
} from "./reference-page.ts";
import { stripDuplicateTitleHeading } from "./render.ts";
import {
  DEFAULT_DIAGRAMS_CONFIG,
  mergeConfig,
  resolvePermalink,
  type SoraneConfig,
} from "./config.ts";
import {
  breadcrumbItemsForPage,
  buildBreadcrumbJsonLd,
  findabilityFlags,
  llmsContactSection,
  organizationFromSite,
  resolveSitemapLastmod,
} from "./findability.ts";
import {
  buildCloudflareOpsManifest,
  llmsHostingSection,
} from "./hosting-cloudflare.ts";
import {
  buildCreativeWorkJsonLd,
  extractDescription,
  renderArticleBodyWithMetaForConfig,
  renderBlogIndexBody,
  renderIndexBody,
  buildSearchMount,
  buildSearchHead,
  isSearchView,
  renderFeaturedExcerpt,
  sanitizeListDescription,
  buildWebSiteJsonLd,
  rootPrefixFromRel,
  type ArticleListEntry,
  type ArticleNav,
} from "./ssg.ts";
import type { FeaturedMode } from "./config.ts";
import {
  groupByTag,
  groupByYear,
  groupByYearMonth,
  paginate,
  renderArchiveListBody,
  renderMonthListForYear,
  renderYearArchiveIndexBody,
  slugifyTag,
} from "./blog-pages.ts";
import { emitPage } from "./emit-page.ts";
import { siteChromeText, siteLabels } from "./site-labels.ts";
import type { OkfConcept } from "@sorane/okf";
import {
  buildAtomFeed,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  type FeedEntry,
  type SiteEntry,
} from "./site-meta.ts";
import { llmsLicenseSection, resolveSiteLicense } from "./site-license.ts";
import { isDraftFrontmatter } from "./preview-banner.ts";
import {
  diagramHeadForPage,
  emptyDiagramMeta,
  mergeDiagramMeta,
} from "./diagrams/diagram-meta.ts";
import {
  contentHasMermaidFences,
  emitDiagramAssets,
} from "./diagrams/emit-diagram-assets.ts";
import {
  renderBodySectionForConfig,
  type BodySectionOptions,
} from "./diagrams/render-body-section.ts";
import { isD2CompileEnabled } from "./diagrams/compile-d2.ts";
import { isGraphvizCompileEnabled } from "./diagrams/compile-graphviz.ts";
import { isMermaidBuildEnabled } from "./diagrams/compile-mermaid.ts";
import { resolveThemeAssetDir } from "./theme-assets.ts";
import {
  docsNavFor,
  docsNavLinks,
  docsSidebarHtml,
  renderDocsArticleFromConceptWithMetaForConfig,
  renderDocsIndexBody,
  resolveDocsNav,
} from "./docs.ts";
import type { DiagramRenderMeta } from "./diagrams/diagram-meta.ts";
import { buildAssociatedMediaForArticle } from "./associated-media.ts";
import { loadAssetProvenance } from "./asset-provenance.ts";
import {
  collectMarkdownImageRefs,
  dedupeMarkdownImageRefs,
} from "./markdown-image-refs.ts";
import { processStaticAssets } from "./static-assets.ts";
import {
  isNotFoundSource,
  notFoundBodySource,
  notFoundLabels,
  renderCustomNotFoundBody,
  renderDefaultNotFoundBody,
} from "./not-found.ts";
import {
  buildTranslationMap,
  translationGroupKey,
  hreflangAlternatesForPage,
  langForLocale,
  localeIdFromRelPath,
  ogLocaleAlternatesForPage,
  resolveI18nContext,
  resolvePageLocaleInfo,
  type I18nContext,
} from "./i18n.ts";
import { okfValidateOptions } from "./okf-config.ts";

export interface BuildOptions {
  readonly cwd: string;
  readonly config: Partial<SoraneConfig>;
  readonly clean?: boolean;
  /** CI スナップショット用: C2PA 署名をスキップ */
  readonly skipC2pa?: boolean;
  /** `draft: true` のページも出力（`sorane preview` 用） */
  readonly includeDrafts?: boolean;
  /** 全ページにローカルプレビューバナーを付与 */
  readonly preview?: boolean;
}

export interface BuildResult {
  readonly pages: number;
  readonly errors: number;
  readonly durationMs: number;
}

function walkMarkdown(root: string): string[] {
  const out: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else if (name.endsWith(".md")) out.push(abs);
    }
  }
  visit(root);
  return out;
}

function slugFromRel(relPath: string): string {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "");
}

function isIndexPage(p: ParsedConcept): boolean {
  return p.concept.type === "index" || slugFromRel(p.relPath) === "index";
}

function outHtmlRelForParsed(
  p: ParsedConcept,
  config: SoraneConfig,
  i18n: I18nContext,
): string {
  return resolvePageLocaleInfo(p, config, i18n).outRel;
}

function isSystemPage(concept: ParsedConcept["concept"]): boolean {
  return concept.frontmatter.isSystem === true;
}

function isBlogArticle(concept: ParsedConcept["concept"], relPath: string): boolean {
  return (
    resolveEffectiveType(concept.type, concept.profile) === "article" &&
    !isSystemPage(concept) &&
    !isNotFoundSource(relPath) &&
    !isSearchView(concept.frontmatter) &&
    !isRedirectPage(concept.frontmatter) &&
    concept.frontmatter.excludeFromList !== true
  );
}

function includePageInBuild(
  concept: ParsedConcept["concept"],
  includeDrafts: boolean,
): boolean {
  if (!includeDrafts && isDraftFrontmatter(concept.frontmatter)) return false;
  return true;
}

function frontmatterString(
  frontmatter: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = frontmatter[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** index.md 本文がタイトルと同じ見出しだけなら intro を出さない。 */
async function introHtmlFromBodyWithMeta(
  body: string,
  title: string,
  sectionOpts: BodySectionOptions,
): Promise<{ readonly introHtml?: string; readonly diagrams: DiagramRenderMeta }> {
  const trimmed = body.trim();
  if (!trimmed) return { diagrams: emptyDiagramMeta() };
  const onlyH1 = /^#\s+(.+?)\s*$/s.exec(trimmed);
  if (onlyH1 && onlyH1[1]!.trim() === title.trim()) {
    return { diagrams: emptyDiagramMeta() };
  }
  const section = await renderBodySectionForConfig(body, sectionOpts);
  return { introHtml: section.html, diagrams: section.diagrams };
}

function syntheticConcept(title: string, description?: string): OkfConcept {
  return {
    type: "index",
    title,
    body: "",
    frontmatter: {},
    warnings: [],
    description,
  };
}

const DEFAULT_LOCALE_ID = "default";

function localeBlogPathPrefix(localeId: string, i18n: I18nContext): string {
  if (localeId === DEFAULT_LOCALE_ID) return "";
  return `${i18n.locales[localeId]!.path_prefix}/`;
}

function articleSummariesForLocale(
  parsed: readonly ParsedConcept[],
  config: SoraneConfig,
  i18n: I18nContext,
  localeId: string,
  includeDrafts: boolean,
): ArticleListEntry[] {
  return parsed
    .filter(
      (p) =>
        isBlogArticle(p.concept, p.relPath) &&
        includePageInBuild(p.concept, includeDrafts) &&
        localeIdFromRelPath(p.relPath, i18n) === localeId,
    )
    .map((p) => {
      const outRel = resolvePageLocaleInfo(p, config, i18n).outRel;
      const rawDesc =
        p.concept.description ?? extractDescription(p.concept.body) ?? undefined;
      const aiDisclosure = parseAiDisclosure(p.concept.frontmatter) ?? undefined;
      return {
        title: p.concept.title,
        href: outRel,
        timestamp: p.concept.timestamp,
        updated: frontmatterString(p.concept.frontmatter, "updated"),
        author: frontmatterString(p.concept.frontmatter, "author"),
        description: rawDesc ? sanitizeListDescription(rawDesc) : undefined,
        tags: p.concept.tags,
        aiDisclosure,
      };
    })
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
}

function articleNavFor(
  href: string,
  summaries: readonly ArticleListEntry[],
): ArticleNav | undefined {
  const i = summaries.findIndex((s) => s.href === href);
  if (i < 0) return undefined;
  const prev =
    i > 0
      ? { href: summaries[i - 1]!.href, title: summaries[i - 1]!.title }
      : undefined;
  const next =
    i < summaries.length - 1
      ? { href: summaries[i + 1]!.href, title: summaries[i + 1]!.title }
      : undefined;
  if (!prev && !next) return undefined;
  return { prev, next };
}

/** @internal Exported for unit tests (OKF bundle tar header limits). */
export function tarBytes(entries: Array<{ path: string; content: string }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    if (entry.path.length > 100) {
      throw new Error(`bundle path exceeds tar name limit (100): ${entry.path}`);
    }
    const content = Buffer.from(entry.content, "utf8");
    const header = Buffer.alloc(512, 0);
    header.write(entry.path, 0, "ascii");
    header.write("0000644\0", 100, "ascii");
    header.write("0000000\0", 108, "ascii");
    header.write("0000000\0", 116, "ascii");
    header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, "ascii");
    header.write("0".padStart(11, "0") + "\0", 136, "ascii");
    header.write("        ", 148, "ascii");
    header.write("ustar\0", 257, "ascii");
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i]!;
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    blocks.push(header, content);
    const pad = (512 - (content.length % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

/** サイト cwd または親ディレクトリからテーマ CSS を探す（monorepo の website/ 等）。 */
function resolveThemeAssetFile(cwd: string, filename: string): string | null {
  const rel = join("templates", "default", "assets", filename);
  let dir = resolve(cwd);
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveThemeCss(cwd: string): string | null {
  return resolveThemeAssetFile(cwd, "main.css");
}

const DEFAULT_CSS = `/* sorane default */
:root { color-scheme: light; --text: #1a1a1a; --muted: #555; --link: #0b57d0; }
body { font-family: system-ui, sans-serif; line-height: 1.7; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: var(--text); }
a { color: var(--link); }
h1 { line-height: 1.25; }
.article-meta { color: var(--muted); font-size: 0.9rem; }
.article-list { padding-left: 1.25rem; }
article pre { overflow-x: auto; }
`;

export async function runBuild(opts: BuildOptions): Promise<BuildResult> {
  const startedAt = performance.now();
  const { cwd } = opts;
  const config = mergeConfig(opts.config);
  const includeDrafts = opts.includeDrafts === true;
  const previewMode = opts.preview === true;
  const pageEmitBase = { previewMode };
  const buildOutputs = resolveBuildOutputs(config.build.outputs);
  const okfOpts = okfValidateOptions(config);
  const contentDir = resolve(cwd, config.build.content_dir);
  const outDir = resolve(cwd, config.build.out_dir);

  if (!existsSync(contentDir)) {
    throw new Error(`content directory not found: ${contentDir}`);
  }

  if (opts.clean && existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  if (buildOutputs.okf_bundle) {
    mkdirSync(join(outDir, "okf"), { recursive: true });
  }
  mkdirSync(join(outDir, "assets"), { recursive: true });

  const mdFiles = walkMarkdown(contentDir);
  const parsed: ParsedConcept[] = [];
  let errors = 0;

  for (const abs of mdFiles) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    const p = parseConcept(abs, rel, source, okfOpts);
    parsed.push(p);
    if (!p.validation.ok) {
      errors += p.validation.issues.length;
      for (const issue of p.validation.issues) {
        process.stderr.write(`[sorane] ${rel}: ${issue.message}\n`);
      }
    }
    for (const w of p.validation.warnings) {
      process.stderr.write(`[sorane] ${rel}: warning: ${w}\n`);
    }
  }

  if (errors > 0) {
    throw new Error(`build aborted: ${errors} validation error(s)`);
  }

  const baseUrl = config.site.base_url.replace(/\/$/, "");
  const i18n = resolveI18nContext(config.site);
  const translationMap = buildTranslationMap(parsed, config, i18n);
  const siteOrganization = organizationFromSite(config.site);
  const siteLicense = resolveSiteLicense(config.site);
  const siteLicenseUrl = siteLicense?.url;
  const siteFindability = findabilityFlags(config.site);
  const diagramConfig = config.build.diagrams ?? DEFAULT_DIAGRAMS_CONFIG;
  const d2OutDir = join(outDir, "assets", "diagrams", "d2");
  const mermaidOutDir = join(outDir, "assets", "diagrams", "mermaid");
  const graphvizOutDir = join(outDir, "assets", "diagrams", "graphviz");
  if (isD2CompileEnabled(diagramConfig)) mkdirSync(d2OutDir, { recursive: true });
  if (isMermaidBuildEnabled(diagramConfig)) mkdirSync(mermaidOutDir, { recursive: true });
  if (isGraphvizCompileEnabled(diagramConfig)) mkdirSync(graphvizOutDir, { recursive: true });
  const glossaryLinkIndex = buildGlossaryLinkIndex(parsed, config, i18n);
  const bodySectionOpts = (rootPrefix: string): BodySectionOptions => ({
    diagrams: diagramConfig,
    glossaryIndex: glossaryLinkIndex,
    rootPrefix,
    d2OutDir,
    mermaidOutDir,
    graphvizOutDir,
    onDiagramWarning: (message) => process.stderr.write(`[sorane] ${message}\n`),
  });

  const hasAnyDisclosure = parsed.some(
    (p) => parseAiDisclosure(p.concept.frontmatter) !== null,
  );
  const siteAiFlags = resolveAiDisclosureFlags(
    config.build.ai_disclosure,
    hasAnyDisclosure,
  );

  const blogOpts = {
    page_size: config.build.blog?.page_size ?? 50,
    index_archive_limit: config.build.blog?.index_archive_limit ?? 15,
    featured_mode: (config.build.blog?.featured_mode ?? "excerpt") as FeaturedMode,
    excerpt_length: config.build.blog?.excerpt_length ?? 400,
    show_list_descriptions: config.build.blog?.show_list_descriptions ?? false,
    archives: config.build.blog?.archives ?? true,
    tags: config.build.blog?.tags ?? true,
  };

  const articleSummaries: ArticleListEntry[] = parsed
    .filter(
      (p) =>
        isBlogArticle(p.concept, p.relPath) &&
        includePageInBuild(p.concept, includeDrafts) &&
        localeIdFromRelPath(p.relPath, i18n) === "default",
    )
    .map((p) => {
      const outRel = resolvePageLocaleInfo(p, config, i18n).outRel;
      const rawDesc =
        p.concept.description ?? extractDescription(p.concept.body) ?? undefined;
      const aiDisclosure = parseAiDisclosure(p.concept.frontmatter) ?? undefined;
      return {
        title: p.concept.title,
        href: outRel,
        timestamp: p.concept.timestamp,
        updated: frontmatterString(p.concept.frontmatter, "updated"),
        author: frontmatterString(p.concept.frontmatter, "author"),
        description: rawDesc ? sanitizeListDescription(rawDesc) : undefined,
        tags: p.concept.tags,
        aiDisclosure,
      };
    })
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

  const parsedByHref = new Map<string, ParsedConcept>();
  for (const p of parsed) {
    if (!isBlogArticle(p.concept, p.relPath)) continue;
    if (localeIdFromRelPath(p.relPath, i18n) !== "default") continue;
    parsedByHref.set(resolvePageLocaleInfo(p, config, i18n).outRel, p);
  }

  const indexParsed = parsed.find(
    (p) => isIndexPage(p) && localeIdFromRelPath(p.relPath, i18n) === "default",
  );

  const titleByHref = new Map<string, string>();
  for (const p of parsed) {
    titleByHref.set(resolvePageLocaleInfo(p, config, i18n).outRel, p.concept.title);
  }
  const docsNav = resolveDocsNav(config.docs?.nav, titleByHref);
  const docsMode = docsNav.length > 0;
  const docsHrefSet = new Set(docsNavLinks(docsNav).map((item) => item.href));

  type FontProcessorType = {
    fontCssForPage: (opts: {
      body: string;
      title: string;
      extraText: string;
      frontmatter: Record<string, unknown>;
      rootPrefix: string;
    }) => Promise<string | undefined>;
  };
  let fontProcessor: FontProcessorType | null = null;
  if (config.fonts.enabled) {
    try {
      const { createFontProcessor } = await import("@sorane/font");
      fontProcessor = await createFontProcessor(cwd, config.fonts, outDir);
    } catch (err) {
      const { isOptionalModuleMissing, warnOptionalPackageMissing } = await import(
        "./optional-dep.ts"
      );
      if (isOptionalModuleMissing(err)) {
        warnOptionalPackageMissing(
          { packageName: "@sorane/font", feature: "font embedding (fonts.enabled)" },
          cwd,
        );
        process.stderr.write("[sorane] skipping font embedding\n");
      } else {
        throw err;
      }
    }
  }

  const sourceToUrl = new Map<string, string>();
  let searchPageRel: string | undefined;
  for (const p of parsed) {
    const rel = p.relPath.replace(/\\/g, "/");
    const outRel = resolvePageLocaleInfo(p, config, i18n).outRel;
    if (!isSystemPage(p.concept) && !isNotFoundSource(rel)) {
      sourceToUrl.set(rel, outRel);
    }
    if (isSearchView(p.concept.frontmatter) && p.concept.type === "article") {
      searchPageRel = outRel;
    }
  }

  const indexDbPath = resolve(cwd, config.search.index);
  let searchIndexReady = false;
  const searchMode = config.search.mode ?? "fts";
  if (searchPageRel && existsSync(indexDbPath)) {
    try {
      const { IndexStore } = await import("@sorane/search");
      const probe = new IndexStore(indexDbPath);
      const { chunks } = probe.counts();
      if (chunks > 0) {
        if (searchMode === "hybrid") {
          searchIndexReady = probe.hasVectors();
        } else {
          searchIndexReady = true;
        }
      }
      probe.close();
    } catch (err) {
      const { isOptionalModuleMissing, warnOptionalPackageMissing } = await import(
        "./optional-dep.ts"
      );
      if (!isOptionalModuleMissing(err)) throw err;
      warnOptionalPackageMissing(
        { packageName: "@sorane/search", feature: "search index probing" },
        cwd,
      );
    }
  }
  const headerSearchEnabled = searchIndexReady;
  const searchNavPath = headerSearchEnabled || !searchIndexReady ? undefined : searchPageRel;
  const showArchiveInHeader =
    Boolean(indexParsed) && blogOpts.archives && !headerSearchEnabled;

  function headerSearchFor(
    rootPrefix: string,
    page: { readonly docsLayout?: boolean; readonly isSearch?: boolean },
  ): { readonly headerSearchHtml?: string; readonly extraHead?: string[] } {
    if (!headerSearchEnabled || page.isSearch) return {};
    return {
      headerSearchHtml: buildSearchMount(rootPrefix, {
        assetBaseUrl: config.search.asset_base_url,
        mode: searchMode,
        variant: "header",
        lang: config.site.lang,
      }),
      extraHead: buildSearchHead(rootPrefix, searchMode),
    };
  }

  const siteEntries: SiteEntry[] = [];
  const catalogInputs: Array<{
    slug: string;
    url: string;
    concept: ParsedConcept["concept"];
    localeId: string;
    groupKey: string;
    lang: string;
  }> = [];
  let builtPages = 0;

  async function fontCssFor(
    concept: ParsedConcept["concept"],
    rootPrefix: string,
    pageLang: string,
    renderedHtml?: string,
  ): Promise<string | undefined> {
    if (!fontProcessor) return undefined;
    const chrome = siteChromeText(
      pageLang,
      config.site.title,
      Boolean(searchNavPath),
    );
    const extraText =
      (renderedHtml ? plainTextFromHtml(renderedHtml) : "") +
      chrome +
      rubyCharsetExtraFromBody(concept.body);
    return fontProcessor.fontCssForPage({
      body: concept.body,
      title: concept.title,
      extraText,
      frontmatter: {
        ...concept.frontmatter,
        type: concept.type,
        noFontEmbedding: concept.frontmatter.noFontEmbedding,
      },
      rootPrefix,
    });
  }

  const assetProvenance = loadAssetProvenance(
    contentDir,
    config.build.image_metadata?.manifest,
  );
  const staticDirName = config.build.static_dir ?? "static";

  const glossaryTermEntries: GlossaryTermIndexEntry[] = [];

  // --- Phase A: content pages（article, dataset, reference, glossary, glossary-term, faq）---
  for (const p of parsed) {
    if (
      !isBuildableContentType(p.concept.type, p.concept.profile) ||
      isSystemPage(p.concept) ||
      isNotFoundSource(p.relPath) ||
      !includePageInBuild(p.concept, includeDrafts)
    ) {
      continue;
    }

    const effectiveType = resolveEffectiveType(p.concept.type, p.concept.profile);
    const pageLocale = resolvePageLocaleInfo(p, config, i18n);
    const { outRel, lang: pageLang } = pageLocale;
    const groupKey = translationGroupKey(p, i18n);
    const pageHreflang = hreflangAlternatesForPage(
      groupKey,
      pageLocale.localeId,
      translationMap,
      baseUrl,
      i18n,
    );
    const pageOgLocaleAlternates = ogLocaleAlternatesForPage(
      groupKey,
      pageLang,
      translationMap,
      i18n,
    );
    const slug = slugFromRel(pageLocale.logicalRelPath);
    if (isRedirectPage(p.concept.frontmatter)) {
      continue;
    }
    const depth = outRel.replace(/\\/g, "/").split("/").length - 1;
    const rootPrefix = depth > 0 ? "../".repeat(depth) : "./";
    const isSearch =
      effectiveType === "article" && isSearchView(p.concept.frontmatter);
    const isDocsPage = docsMode && docsHrefSet.has(outRel);
    const nav = isSearch
      ? undefined
      : isDocsPage
        ? docsNavFor(outRel, docsNav)
        : articleNavFor(outRel, articleSummaries);
    const aiDisclosure = parseAiDisclosure(p.concept.frontmatter);
    const pageAiFlags = resolveAiDisclosureFlags(
      config.build.ai_disclosure,
      aiDisclosure !== null,
    );
    const badgeHtml =
      pageAiFlags.badges && aiDisclosure
        ? buildAiBadgeHtml(aiDisclosure, {
            lang: pageLang,
            rootPrefix,
            policyUrl: pageAiFlags.policyUrl,
          })
        : "";
    let pageDiagrams = emptyDiagramMeta();
    let bodyHtml: string;
    let faqJsonLdItems: ReturnType<typeof parseFaqBody> | undefined;
    let faqAnswerHtmls: string[] | undefined;
    let glossaryResolved: ReturnType<typeof resolveGlossaryTerms> | undefined;
    let glossaryDefinitionHtmls: string[] | undefined;
    let glossaryTermMeta: ReturnType<typeof resolveGlossaryTermMeta> | undefined;
    const canonicalUrl = baseUrl.length > 0 ? `${baseUrl}/${outRel}` : undefined;
    if (effectiveType === "dataset") {
      const section = await renderBodySectionForConfig(
        p.concept.body,
        bodySectionOpts(rootPrefix),
      );
      pageDiagrams = section.diagrams;
      bodyHtml = renderDatasetPageBody(p.concept, section.html, {
        pageUrl: canonicalUrl ?? outRel,
        baseUrl,
      });
    } else if (effectiveType === "faq") {
      const parsedFaq = parseFaqBody(p.concept.body);
      faqJsonLdItems = parsedFaq;
      const answerSections = await Promise.all(
        parsedFaq.items.map((item) =>
          item.answerMarkdown.length > 0
            ? renderBodySectionForConfig(item.answerMarkdown, bodySectionOpts(rootPrefix))
            : Promise.resolve({ html: "", diagrams: emptyDiagramMeta() }),
        ),
      );
      for (const s of answerSections) {
        pageDiagrams = mergeDiagramMeta(pageDiagrams, s.diagrams);
      }
      faqAnswerHtmls = answerSections.map((s) => s.html);
      const introSection =
        parsedFaq.preambleMarkdown.length > 0
          ? await renderBodySectionForConfig(
              parsedFaq.preambleMarkdown,
              bodySectionOpts(rootPrefix),
            )
          : undefined;
      if (introSection) {
        pageDiagrams = mergeDiagramMeta(pageDiagrams, introSection.diagrams);
      }
      bodyHtml = renderFaqPageBody(
        p.concept,
        parsedFaq.items,
        faqAnswerHtmls,
        introSection?.html,
      );
    } else if (effectiveType === "glossary") {
      const resolved = resolveGlossaryTerms(p.concept.body, p.concept.frontmatter);
      glossaryResolved = resolved;
      const definitionSections = await Promise.all(
        resolved.items.map((term) =>
          term.definitionMarkdown.length > 0
            ? renderBodySectionForConfig(
                term.definitionMarkdown,
                bodySectionOpts(rootPrefix),
              )
            : Promise.resolve({ html: "", diagrams: emptyDiagramMeta() }),
        ),
      );
      for (const s of definitionSections) {
        pageDiagrams = mergeDiagramMeta(pageDiagrams, s.diagrams);
      }
      glossaryDefinitionHtmls = definitionSections.map((s) => s.html);
      const introSection =
        resolved.source === "body" && resolved.preambleMarkdown.length > 0
          ? await renderBodySectionForConfig(
              resolved.preambleMarkdown,
              bodySectionOpts(rootPrefix),
            )
          : undefined;
      if (introSection) {
        pageDiagrams = mergeDiagramMeta(pageDiagrams, introSection.diagrams);
      }
      bodyHtml = renderGlossaryPageBody(
        p.concept,
        resolved.items,
        glossaryDefinitionHtmls,
        introSection?.html,
      );
    } else if (effectiveType === "glossary-term") {
      glossaryTermMeta = resolveGlossaryTermMeta(p.concept.frontmatter);
      const section = await renderBodySectionForConfig(
        stripDuplicateTitleHeading(p.concept.body, p.concept.title),
        bodySectionOpts(rootPrefix),
      );
      pageDiagrams = section.diagrams;
      bodyHtml = renderGlossaryTermPageBody(p.concept, section.html, glossaryTermMeta, {
        rootPrefix,
      });
      const rawDesc =
        p.concept.description ?? extractDescription(p.concept.body) ?? undefined;
      glossaryTermEntries.push({
        title: p.concept.title,
        href: outRel,
        termId: glossaryTermMeta.termId,
        parentHref: glossaryTermMeta.inDefinedTermSet,
        description: rawDesc ? sanitizeListDescription(rawDesc) : undefined,
      });
    } else if (effectiveType === "reference") {
      const section = await renderBodySectionForConfig(
        stripDuplicateTitleHeading(p.concept.body, p.concept.title),
        bodySectionOpts(rootPrefix),
      );
      pageDiagrams = section.diagrams;
      bodyHtml = renderReferencePageBody(p.concept, section.html);
    } else if (isSearch) {
      const searchIntro = p.concept.body.trim()
        ? await renderBodySectionForConfig(p.concept.body, bodySectionOpts(rootPrefix))
        : undefined;
      pageDiagrams = searchIntro?.diagrams ?? emptyDiagramMeta();
      bodyHtml =
        buildSearchMount(rootPrefix, {
          assetBaseUrl: config.search.asset_base_url,
          mode: searchMode,
          lang: pageLang,
        }) +
        (searchIntro
          ? `<div class="search-intro">${searchIntro.html}</div>`
          : "");
    } else if (isDocsPage) {
      const doc = await renderDocsArticleFromConceptWithMetaForConfig(
        p.concept,
        nav,
        pageLang,
        { badgeHtml, ...bodySectionOpts(rootPrefix) },
      );
      bodyHtml = doc.bodyHtml;
      pageDiagrams = doc.diagrams;
    } else {
      const article = await renderArticleBodyWithMetaForConfig(p.concept, nav, {
        badgeHtml,
        lang: pageLang,
        ...bodySectionOpts(rootPrefix),
      });
      bodyHtml = article.bodyHtml;
      pageDiagrams = article.diagrams;
    }
    const diagramHead = diagramHeadForPage(
      pageDiagrams,
      rootPrefix,
      diagramConfig,
    );

    const updated = frontmatterString(p.concept.frontmatter, "updated");
    const author = frontmatterString(p.concept.frontmatter, "author");
    const pageImageRefs = collectMarkdownImageRefs({
      body: p.concept.body,
      sourceMdRel: p.relPath,
      outHtmlRel: outRel,
      contentDir,
      cwd,
      staticDirName,
    });
    const associatedMedia =
      pageAiFlags.jsonLd && !isSearch
        ? buildAssociatedMediaForArticle({
            refs: pageImageRefs,
            provenance: assetProvenance,
            baseUrl,
          })
        : [];

    const jsonLd = isSearch
      ? ""
      : effectiveType === "dataset"
        ? buildDatasetPageJsonLd(
            { slug, url: canonicalUrl ?? outRel, concept: p.concept },
            pageAiFlags.jsonLd,
          )
        : effectiveType === "faq" && faqJsonLdItems && faqAnswerHtmls
          ? buildFaqPageJsonLd({
              title: p.concept.title,
              description:
                p.concept.description ?? extractDescription(p.concept.body) ?? undefined,
              url: canonicalUrl ?? outRel,
              datePublished: p.concept.timestamp,
              dateModified: updated ?? p.concept.timestamp,
              author,
              siteTitle: config.site.title,
              lang: pageLang,
              items: faqJsonLdItems.items,
              answerHtmls: faqAnswerHtmls,
              aiDisclosure:
                pageAiFlags.jsonLd && aiDisclosure ? aiDisclosure : undefined,
              associatedMedia: associatedMedia.length > 0 ? associatedMedia : undefined,
              organization: siteOrganization,
              frontmatter: p.concept.frontmatter,
            })
          : effectiveType === "glossary" && glossaryResolved && glossaryDefinitionHtmls
            ? buildGlossaryPageJsonLd({
                title: p.concept.title,
                description:
                  p.concept.description ?? extractDescription(p.concept.body) ?? undefined,
                url: canonicalUrl ?? outRel,
                datePublished: p.concept.timestamp,
                dateModified: updated ?? p.concept.timestamp,
                author,
                siteTitle: config.site.title,
                lang: pageLang,
                terms: glossaryResolved.items,
                definitionHtmls: glossaryDefinitionHtmls,
                aiDisclosure:
                  pageAiFlags.jsonLd && aiDisclosure ? aiDisclosure : undefined,
                associatedMedia: associatedMedia.length > 0 ? associatedMedia : undefined,
                organization: siteOrganization,
                frontmatter: p.concept.frontmatter,
              })
            : effectiveType === "glossary-term" && glossaryTermMeta
              ? buildGlossaryTermJsonLd({
                  title: p.concept.title,
                  description:
                    p.concept.description ?? extractDescription(p.concept.body) ?? undefined,
                  url: canonicalUrl ?? outRel,
                  datePublished: p.concept.timestamp,
                  dateModified: updated ?? p.concept.timestamp,
                  author,
                  siteTitle: config.site.title,
                  lang: pageLang,
                  termId: glossaryTermMeta.termId,
                  inDefinedTermSet: glossaryTermMeta.inDefinedTermSet,
                  definitionHtml: bodyHtml,
                  definitionMarkdown: p.concept.body,
                  seeAlso: glossaryTermMeta.seeAlso,
                  aiDisclosure:
                    pageAiFlags.jsonLd && aiDisclosure ? aiDisclosure : undefined,
                  associatedMedia: associatedMedia.length > 0 ? associatedMedia : undefined,
                  organization: siteOrganization,
                  frontmatter: p.concept.frontmatter,
                })
              : effectiveType === "reference"
              ? buildReferencePageJsonLd({
                  title: p.concept.title,
                  description:
                    p.concept.description ?? extractDescription(p.concept.body) ?? undefined,
                  url: canonicalUrl ?? outRel,
                  resource: p.concept.resource,
                  datePublished: p.concept.timestamp,
                  dateModified: updated ?? p.concept.timestamp,
                  author,
                  siteTitle: config.site.title,
                  lang: pageLang,
                  tags: p.concept.tags,
                  aiDisclosure:
                    pageAiFlags.jsonLd && aiDisclosure ? aiDisclosure : undefined,
                  associatedMedia: associatedMedia.length > 0 ? associatedMedia : undefined,
                  organization: siteOrganization,
                  frontmatter: p.concept.frontmatter,
                })
              : buildCreativeWorkJsonLd({
            workType: resolveCatalogCreativeWorkType(p.concept, docsMode),
            title: p.concept.title,
            description:
              p.concept.description ?? extractDescription(p.concept.body) ?? undefined,
            url: canonicalUrl ?? outRel,
            datePublished: p.concept.timestamp,
            dateModified: updated ?? p.concept.timestamp,
            author,
            siteTitle: config.site.title,
            lang: pageLang,
            aiDisclosure:
              pageAiFlags.jsonLd && aiDisclosure ? aiDisclosure : undefined,
            associatedMedia: associatedMedia.length > 0 ? associatedMedia : undefined,
            organization: siteOrganization,
            frontmatter: p.concept.frontmatter,
            licenseUrl: siteLicenseUrl,
          });

    const breadcrumbJsonLd =
      siteFindability.breadcrumbs &&
      !isSearch &&
      effectiveType !== "index" &&
      canonicalUrl
        ? buildBreadcrumbJsonLd({
            items: breadcrumbItemsForPage({
              baseUrl,
              homeTitle: config.site.title,
              pageTitle: p.concept.title,
              pageUrl: canonicalUrl,
            }),
          })
        : "";

    const fontCss = await fontCssFor(p.concept, rootPrefix, pageLang, bodyHtml);
    const headerSearch = headerSearchFor(rootPrefix, {
      docsLayout: isDocsPage,
      isSearch,
    });
    const extraHead = isSearch
      ? [
          ...buildSearchHead(rootPrefix, searchMode),
          ...(diagramHead ? [diagramHead] : []),
        ]
      : [
          ...(jsonLd ? [jsonLd] : []),
          ...(breadcrumbJsonLd ? [breadcrumbJsonLd] : []),
          ...(headerSearch.extraHead ?? []),
          ...(diagramHead ? [diagramHead] : []),
        ];
    emitPage({
      ...pageEmitBase,
      cwd,
      config,
      outDir,
      outRel,
      concept: p.concept,
      bodyHtml,
      baseUrl,
      fontCss,
      lang: pageLang,
      localeId: pageLocale.localeId,
      hreflangAlternates: pageHreflang.length > 0 ? pageHreflang : undefined,
      ogLocaleAlternates:
        pageOgLocaleAlternates.length > 0 ? pageOgLocaleAlternates : undefined,
      extraHead: extraHead.length > 0 ? extraHead : undefined,
      showArchiveNav: showArchiveInHeader,
      searchPath: searchNavPath,
      docsLayout: isDocsPage,
      docsSidebarHtml: isDocsPage ? docsSidebarHtml(docsNav, outRel, outRel) : undefined,
      headerSearchHtml: headerSearch.headerSearchHtml,
    });
    builtPages += 1;

    siteEntries.push({
      url: outRel,
      lastmod: resolveSitemapLastmod(p.concept.timestamp, updated),
      isIndex: false,
    });
    catalogInputs.push({
      slug,
      url: canonicalUrl ?? outRel,
      concept: p.concept,
      localeId: pageLocale.localeId,
      groupKey: translationGroupKey(p, i18n),
      lang: pageLang,
    });
  }

  if (glossaryTermEntries.length > 0) {
    const termsIndexRel = "glossary/terms/index.html";
    const termsIndexHtml = renderGlossaryTermIndexBody(
      config.site.title,
      glossaryTermEntries,
      { fromRel: termsIndexRel, lang: config.site.lang },
    );
    const termsIndexConcept = syntheticConcept(
      `${config.site.title} — ${config.site.lang.startsWith("ja") ? "用語一覧" : "Glossary terms"}`,
    );
    const termsIndexRoot = rootPrefixFromRel(termsIndexRel);
    const termsIndexFontCss = await fontCssFor(
      termsIndexConcept,
      termsIndexRoot,
      i18n.defaultLang,
      termsIndexHtml,
    );
    const termsIndexChrome = headerSearchFor(termsIndexRoot, { isSearch: false });
    emitPage({
      ...pageEmitBase,
      cwd,
      config,
      outDir,
      outRel: termsIndexRel,
      concept: termsIndexConcept,
      bodyHtml: termsIndexHtml,
      baseUrl,
      fontCss: termsIndexFontCss,
      showArchiveNav: showArchiveInHeader,
      searchPath: searchNavPath,
      headerSearchHtml: termsIndexChrome.headerSearchHtml,
      extraHead: termsIndexChrome.extraHead,
    });
    builtPages += 1;
    siteEntries.push({ url: termsIndexRel, lastmod: undefined, isIndex: false });
  }

  const directoryIndexes = discoverDirectoryIndexes(parsed, config, i18n);
  const directoryIndexBundleRows: Array<{ path: string; content: string }> = [];
  for (const spec of directoryIndexes) {
    const outRel = directoryIndexOutRel(spec);
    const indexLang =
      spec.localeId === "default"
        ? config.site.lang
        : (i18n.locales[spec.localeId]?.lang ?? config.site.lang);
    const bodyHtml = renderDirectoryIndexBody(spec, config.site.title, indexLang);
    const indexConcept = syntheticConcept(
      `${config.site.title} — ${humanizeDirectoryLabel(spec.dirRel)}`,
    );
    const indexRoot = rootPrefixFromRel(outRel);
    const indexChrome = headerSearchFor(indexRoot, { isSearch: false });
    const indexFontCss = await fontCssFor(
      indexConcept,
      indexRoot,
      indexLang,
      bodyHtml,
    );
    emitPage({
      ...pageEmitBase,
      cwd,
      config,
      outDir,
      outRel,
      concept: indexConcept,
      bodyHtml,
      baseUrl,
      fontCss: indexFontCss,
      lang: indexLang,
      localeId: spec.localeId,
      showArchiveNav: showArchiveInHeader,
      searchPath: searchNavPath,
      headerSearchHtml: indexChrome.headerSearchHtml,
      extraHead: indexChrome.extraHead,
    });
    builtPages += 1;
    siteEntries.push({ url: outRel, lastmod: undefined, isIndex: false });
    directoryIndexBundleRows.push({
      path: directoryIndexBundlePath(spec),
      content: directoryIndexOkfMarkdown(spec),
    });
  }

  // --- Phase B: index（任意 — content/index.md がある場合のみ）---
  const listForPagination = indexParsed && articleSummaries[0]
    ? articleSummaries.slice(1)
    : articleSummaries;
  const archivePages = paginate(listForPagination, blogOpts.page_size);

  if (indexParsed) {
    const p = indexParsed;
    const indexLocale = resolvePageLocaleInfo(p, config, i18n);
    const indexLang = indexLocale.lang;
    const indexGroupKey = translationGroupKey(p, i18n);
    const indexHreflang = hreflangAlternatesForPage(
      indexGroupKey,
      indexLocale.localeId,
      translationMap,
      baseUrl,
      i18n,
    );
    const indexOgLocaleAlternates = ogLocaleAlternatesForPage(
      indexGroupKey,
      indexLang,
      translationMap,
      i18n,
    );
    const latest = articleSummaries[0];
    const latestParsed = latest ? parsedByHref.get(latest.href) : undefined;
    const useBlogLayout = p.concept.type === "index";

    let bodyHtml: string;
    let indexDiagrams = emptyDiagramMeta();
    const indexTitle = p.concept.title || config.site.title;
    const intro = await introHtmlFromBodyWithMeta(
      p.concept.body,
      indexTitle,
      bodySectionOpts("./"),
    );
    indexDiagrams = mergeDiagramMeta(indexDiagrams, intro.diagrams);

    if (docsMode && useBlogLayout) {
      bodyHtml = renderDocsIndexBody({
        siteTitle: indexTitle,
        description: p.concept.description ?? config.site.description,
        profileUrl: frontmatterString(p.concept.frontmatter, "profileUrl"),
        githubUrl: frontmatterString(p.concept.frontmatter, "githubUrl"),
        introHtml: intro.introHtml,
        docsNav,
        recentArticles: articleSummaries,
        newsLimit: blogOpts.index_archive_limit,
        archiveHref: blogOpts.archives ? "archive/index.html" : undefined,
        lang: indexLang,
      });
    } else if (useBlogLayout) {
      const featuredMode = blogOpts.featured_mode;
      let featuredBody = "";
      if (latestParsed && featuredMode !== "off") {
        if (featuredMode === "full") {
          const featured = await renderBodySectionForConfig(
            latestParsed.concept.body,
            bodySectionOpts("./"),
          );
          featuredBody = featured.html;
          indexDiagrams = mergeDiagramMeta(indexDiagrams, featured.diagrams);
        } else {
          featuredBody = renderFeaturedExcerpt(
            latestParsed.concept,
            blogOpts.excerpt_length,
          );
        }
      }
      bodyHtml = renderBlogIndexBody({
        siteTitle: indexTitle,
        description: p.concept.description ?? config.site.description,
        showHeaderTitle: false,
        profileUrl: frontmatterString(p.concept.frontmatter, "profileUrl"),
        githubUrl: frontmatterString(p.concept.frontmatter, "githubUrl"),
        introHtml: intro.introHtml,
        lang: indexLang,
        latestArticle:
          latestParsed && featuredMode !== "off" && featuredBody
            ? {
                title: latestParsed.concept.title,
                href: latest!.href,
                timestamp: latestParsed.concept.timestamp,
                updated: frontmatterString(latestParsed.concept.frontmatter, "updated"),
                author: frontmatterString(latestParsed.concept.frontmatter, "author"),
                bodyHtml: featuredBody,
                aiDisclosure: latest.aiDisclosure,
              }
            : undefined,
        articles: archivePages[0] ?? [],
        archiveLimit: blogOpts.index_archive_limit,
        showListDescriptions: blogOpts.show_list_descriptions,
        showOnLists: siteAiFlags.showOnLists,
        listRootPrefix: "./",
        moreArticlesHref: archivePages.length > 1 ? "page/2.html" : undefined,
        yearArchiveHref: blogOpts.archives ? "archive/index.html" : undefined,
      });
    } else {
      bodyHtml = renderIndexBody(config.site.title, archivePages[0] ?? articleSummaries);
    }

    const fontCss = await fontCssFor(p.concept, "./", indexLang, bodyHtml);
    const indexCanonical =
      baseUrl.length > 0 ? `${baseUrl}/index.html` : undefined;
    const searchActionUrl =
      siteFindability.searchAction && searchPageRel && baseUrl.length > 0
        ? `${baseUrl}/${searchPageRel}`
        : undefined;
    const indexJsonLd = buildWebSiteJsonLd({
      title: p.concept.title || config.site.title,
      description: p.concept.description ?? config.site.description,
      url: indexCanonical,
      lang: indexLang,
      organization: siteOrganization,
      searchUrl: searchActionUrl,
      licenseUrl: siteLicenseUrl,
    });
    const indexHeaderSearch = headerSearchFor("./", { docsLayout: docsMode });
    const indexDiagramHead = diagramHeadForPage(
      indexDiagrams,
      "./",
      diagramConfig,
    );
    const indexExtraHead = [
      indexJsonLd,
      ...(indexHeaderSearch.extraHead ?? []),
      ...(indexDiagramHead ? [indexDiagramHead] : []),
    ];
    emitPage({
      ...pageEmitBase,
      cwd,
      config,
      outDir,
      outRel: indexLocale.outRel,
      concept: p.concept,
      bodyHtml,
      baseUrl,
      fontCss,
      lang: indexLang,
      localeId: indexLocale.localeId,
      hreflangAlternates: indexHreflang.length > 0 ? indexHreflang : undefined,
      ogLocaleAlternates:
        indexOgLocaleAlternates.length > 0 ? indexOgLocaleAlternates : undefined,
      isIndex: true,
      pageKind: "website",
      extraHead: indexExtraHead,
      showArchiveNav: showArchiveInHeader,
      searchPath: searchNavPath,
      docsLayout: docsMode,
      docsSidebarHtml: docsMode
        ? docsSidebarHtml(docsNav, indexLocale.outRel, indexLocale.outRel)
        : undefined,
      headerSearchHtml: indexHeaderSearch.headerSearchHtml,
    });
    builtPages += 1;
    siteEntries.push({ url: indexLocale.outRel, lastmod: undefined, isIndex: true });
  }

  // --- Phase B2: 非既定ロケールの index（content/en/index.md 等）---
  if (i18n.enabled) {
    for (const localeId of Object.keys(i18n.locales)) {
      const localeIndex = parsed.find(
        (p) => isIndexPage(p) && localeIdFromRelPath(p.relPath, i18n) === localeId,
      );
      if (!localeIndex) continue;

      const pageLocale = resolvePageLocaleInfo(localeIndex, config, i18n);
      const localeArticles: ArticleListEntry[] = parsed
        .filter(
          (p) =>
            isBlogArticle(p.concept, p.relPath) &&
            localeIdFromRelPath(p.relPath, i18n) === localeId,
        )
        .map((p) => {
          const outRel = resolvePageLocaleInfo(p, config, i18n).outRel;
          const rawDesc =
            p.concept.description ?? extractDescription(p.concept.body) ?? undefined;
          const aiDisclosure = parseAiDisclosure(p.concept.frontmatter) ?? undefined;
          return {
            title: p.concept.title,
            href: outRel,
            timestamp: p.concept.timestamp,
            updated: frontmatterString(p.concept.frontmatter, "updated"),
            author: frontmatterString(p.concept.frontmatter, "author"),
            description: rawDesc ? sanitizeListDescription(rawDesc) : undefined,
            tags: p.concept.tags,
            aiDisclosure,
          };
        })
        .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

      const rootPrefix = rootPrefixFromRel(pageLocale.outRel);
      const indexTitle = localeIndex.concept.title || config.site.title;
      const intro = await introHtmlFromBodyWithMeta(
        localeIndex.concept.body,
        indexTitle,
        bodySectionOpts(rootPrefix),
      );
      const useBlogLayout = localeIndex.concept.type === "index";
      const listForLocalePagination =
        localeArticles.length > 0 ? localeArticles.slice(1) : [];
      const localeArchivePages = paginate(listForLocalePagination, blogOpts.page_size);
      let bodyHtml: string;
      if (useBlogLayout) {
        bodyHtml = renderBlogIndexBody({
          siteTitle: indexTitle,
          description: localeIndex.concept.description ?? config.site.description,
          showHeaderTitle: false,
          introHtml: intro.introHtml,
          lang: pageLocale.lang,
          articles: localeArchivePages[0] ?? localeArticles,
          archiveLimit: blogOpts.index_archive_limit,
          showListDescriptions: blogOpts.show_list_descriptions,
          showOnLists: siteAiFlags.showOnLists,
          listRootPrefix: rootPrefix,
          moreArticlesHref:
            localeArchivePages.length > 1 ? "page/2.html" : undefined,
          yearArchiveHref: blogOpts.archives ? "archive/index.html" : undefined,
        });
      } else {
        bodyHtml = renderIndexBody(indexTitle, localeArticles);
      }

      const groupKey = translationGroupKey(localeIndex, i18n);
      const localeHreflang = hreflangAlternatesForPage(
        groupKey,
        pageLocale.localeId,
        translationMap,
        baseUrl,
        i18n,
      );
      const localeOgAlternates = ogLocaleAlternatesForPage(
        groupKey,
        pageLocale.lang,
        translationMap,
        i18n,
      );
      const localeCanonical =
        baseUrl.length > 0 ? `${baseUrl}/${pageLocale.outRel}` : undefined;
      const localeJsonLd = buildWebSiteJsonLd({
        title: localeIndex.concept.title || config.site.title,
        description: localeIndex.concept.description ?? config.site.description,
        url: localeCanonical,
        lang: pageLocale.lang,
        organization: siteOrganization,
        licenseUrl: siteLicenseUrl,
      });
      const localeDiagramHead = diagramHeadForPage(
        intro.diagrams,
        rootPrefix,
        diagramConfig,
      );
      const localeHeaderSearch = headerSearchFor(rootPrefix, { docsLayout: false });
      const localeFontCss = await fontCssFor(
        localeIndex.concept,
        rootPrefix,
        pageLocale.lang,
        bodyHtml,
      );
      emitPage({
        ...pageEmitBase,
        cwd,
        config,
        outDir,
        outRel: pageLocale.outRel,
        concept: localeIndex.concept,
        bodyHtml,
        baseUrl,
        fontCss: localeFontCss,
        lang: pageLocale.lang,
        localeId: pageLocale.localeId,
        hreflangAlternates: localeHreflang.length > 0 ? localeHreflang : undefined,
        ogLocaleAlternates:
          localeOgAlternates.length > 0 ? localeOgAlternates : undefined,
        isIndex: true,
        pageKind: "website",
        extraHead: [
          localeJsonLd,
          ...(localeHeaderSearch.extraHead ?? []),
          ...(localeDiagramHead ? [localeDiagramHead] : []),
        ],
        showArchiveNav: showArchiveInHeader,
        searchPath: searchNavPath,
        headerSearchHtml: localeHeaderSearch.headerSearchHtml,
      });
      builtPages += 1;
      siteEntries.push({
        url: pageLocale.outRel,
        lastmod: undefined,
        isIndex: true,
      });
    }
  }

  // --- Phase C: 派生ブログページ（index がある場合、ロケール別）---
  if (indexParsed) {
    const localesToEmit: Array<{ localeId: string; lang: string }> = [
      { localeId: DEFAULT_LOCALE_ID, lang: i18n.defaultLang },
    ];
    if (i18n.enabled) {
      for (const localeId of Object.keys(i18n.locales)) {
        localesToEmit.push({ localeId, lang: langForLocale(localeId, i18n) });
      }
    }

    for (const { localeId, lang } of localesToEmit) {
      const pathPrefix = localeBlogPathPrefix(localeId, i18n);
      const localeArticles = articleSummariesForLocale(
        parsed,
        config,
        i18n,
        localeId,
        includeDrafts,
      );
      if (localeArticles.length === 0) continue;

      const localeIndex =
        localeId === DEFAULT_LOCALE_ID
          ? indexParsed
          : parsed.find(
              (p) =>
                isIndexPage(p) && localeIdFromRelPath(p.relPath, i18n) === localeId,
            );
      const listForLocalePagination =
        localeIndex && localeArticles[0] ? localeArticles.slice(1) : localeArticles;
      const localeArchivePages = paginate(listForLocalePagination, blogOpts.page_size);
      const labels = siteLabels(lang);

      for (let i = 1; i < localeArchivePages.length; i++) {
        const pageNum = i + 1;
        const outRel = `${pathPrefix}page/${pageNum}.html`;
        const bodyHtml = renderArchiveListBody(
          `${config.site.title} — ${labels.pageNumber} ${pageNum}`,
          undefined,
          localeArchivePages[i]!,
          {
            fromRel: outRel,
            page: pageNum,
            totalPages: localeArchivePages.length,
            showOnLists: siteAiFlags.showOnLists,
            lang,
          },
        );
        const concept = syntheticConcept(
          `${config.site.title} — ${labels.pageNumber} ${pageNum}`,
        );
        const rootPrefix = rootPrefixFromRel(outRel);
        const fontCss = await fontCssFor(concept, rootPrefix, lang, bodyHtml);
        const pageChrome = headerSearchFor(rootPrefix, { isSearch: false });
        emitPage({
          ...pageEmitBase,
          cwd,
          config,
          outDir,
          outRel,
          concept,
          bodyHtml,
          baseUrl,
          fontCss,
          lang,
          localeId,
          showArchiveNav: showArchiveInHeader,
          searchPath: searchNavPath,
          headerSearchHtml: pageChrome.headerSearchHtml,
          extraHead: pageChrome.extraHead,
        });
        builtPages += 1;
        siteEntries.push({ url: outRel, lastmod: undefined, isIndex: false });
      }

      if (blogOpts.archives) {
        const byYear = groupByYear(localeArticles);
        const byMonth = groupByYearMonth(localeArticles);
        const archiveIndexRel = `${pathPrefix}archive/index.html`;

        const archiveIndexHtml = renderYearArchiveIndexBody(
          config.site.title,
          byYear,
          archiveIndexRel,
          lang,
        );
        const archiveIndexConcept = syntheticConcept(
          `${config.site.title} — ${labels.yearArchiveIndex}`,
        );
        const archiveIndexFontCss = await fontCssFor(
          archiveIndexConcept,
          rootPrefixFromRel(archiveIndexRel),
          lang,
          archiveIndexHtml,
        );
        const archiveIndexChrome = headerSearchFor(rootPrefixFromRel(archiveIndexRel), {
          isSearch: false,
        });
        emitPage({
          ...pageEmitBase,
          cwd,
          config,
          outDir,
          outRel: archiveIndexRel,
          concept: archiveIndexConcept,
          bodyHtml: archiveIndexHtml,
          baseUrl,
          fontCss: archiveIndexFontCss,
          lang,
          localeId,
          showArchiveNav: showArchiveInHeader,
          searchPath: searchNavPath,
          headerSearchHtml: archiveIndexChrome.headerSearchHtml,
          extraHead: archiveIndexChrome.extraHead,
        });
        builtPages += 1;
        siteEntries.push({ url: archiveIndexRel, lastmod: undefined, isIndex: false });

        for (const year of [...byYear.keys()].sort((a, b) => b.localeCompare(a))) {
          const yearOutRel = `${pathPrefix}archive/${year}.html`;
          const yearHtml = renderMonthListForYear(year, byMonth, yearOutRel, lang);
          const yearTitle = lang.startsWith("ja") ? `${year}年` : year;
          const yearConcept = syntheticConcept(yearTitle);
          const yearFontCss = await fontCssFor(
            yearConcept,
            rootPrefixFromRel(yearOutRel),
            lang,
            yearHtml,
          );
          const yearChrome = headerSearchFor(rootPrefixFromRel(yearOutRel), { isSearch: false });
          emitPage({
            ...pageEmitBase,
            cwd,
            config,
            outDir,
            outRel: yearOutRel,
            concept: yearConcept,
            bodyHtml: yearHtml,
            baseUrl,
            fontCss: yearFontCss,
            lang,
            localeId,
            showArchiveNav: showArchiveInHeader,
            searchPath: searchNavPath,
            headerSearchHtml: yearChrome.headerSearchHtml,
            extraHead: yearChrome.extraHead,
          });
          builtPages += 1;
          siteEntries.push({ url: yearOutRel, lastmod: undefined, isIndex: false });
        }

        for (const ym of [...byMonth.keys()].sort((a, b) => b.localeCompare(a))) {
          const monthArticles = byMonth.get(ym)!;
          const [y, m] = ym.split("-");
          const monthOutRel = `${pathPrefix}archive/${ym}.html`;
          const monthTitle = lang.startsWith("ja") ? `${y}年${m}月` : `${y}-${m}`;
          const bodyHtml = renderArchiveListBody(monthTitle, undefined, monthArticles, {
            fromRel: monthOutRel,
            showOnLists: siteAiFlags.showOnLists,
            lang,
          });
          const monthConcept = syntheticConcept(monthTitle);
          const monthFontCss = await fontCssFor(
            monthConcept,
            rootPrefixFromRel(monthOutRel),
            lang,
            bodyHtml,
          );
          const monthChrome = headerSearchFor(rootPrefixFromRel(monthOutRel), { isSearch: false });
          emitPage({
            ...pageEmitBase,
            cwd,
            config,
            outDir,
            outRel: monthOutRel,
            concept: monthConcept,
            bodyHtml,
            baseUrl,
            fontCss: monthFontCss,
            lang,
            localeId,
            showArchiveNav: showArchiveInHeader,
            searchPath: searchNavPath,
            headerSearchHtml: monthChrome.headerSearchHtml,
            extraHead: monthChrome.extraHead,
          });
          builtPages += 1;
          siteEntries.push({ url: monthOutRel, lastmod: undefined, isIndex: false });
        }
      }

      if (blogOpts.tags) {
        const byTag = groupByTag(localeArticles);
        for (const [tagSlug, tagged] of byTag) {
          const label = tagged[0]?.tags?.find((t) => slugifyTag(t) === tagSlug) ?? tagSlug;
          const tagOutRel = `${pathPrefix}tag/${tagSlug}.html`;
          const bodyHtml = renderArchiveListBody(
            `${labels.tagTitle}: ${label}`,
            undefined,
            tagged,
            {
              fromRel: tagOutRel,
              showOnLists: siteAiFlags.showOnLists,
              lang,
            },
          );
          const tagConcept = syntheticConcept(`${labels.tagTitle}: ${label}`);
          const tagFontCss = await fontCssFor(
            tagConcept,
            rootPrefixFromRel(tagOutRel),
            lang,
            bodyHtml,
          );
          const tagChrome = headerSearchFor(rootPrefixFromRel(tagOutRel), { isSearch: false });
          emitPage({
            ...pageEmitBase,
            cwd,
            config,
            outDir,
            outRel: tagOutRel,
            concept: tagConcept,
            bodyHtml,
            baseUrl,
            fontCss: tagFontCss,
            lang,
            localeId,
            showArchiveNav: showArchiveInHeader,
            searchPath: searchNavPath,
            headerSearchHtml: tagChrome.headerSearchHtml,
            extraHead: tagChrome.extraHead,
          });
          builtPages += 1;
          siteEntries.push({ url: tagOutRel, lastmod: undefined, isIndex: false });
        }
      }
    }
  }

  const aiLabeledCount = articleSummaries.filter((a) => a.aiDisclosure).length;
  const feedEntries: FeedEntry[] = articleSummaries.slice(0, 30).map((a) => {
    const absUrl = baseUrl.length > 0 ? `${baseUrl}/${a.href}` : a.href;
    const ts = a.timestamp ?? new Date().toISOString();
    const pageFlags = resolveAiDisclosureFlags(
      config.build.ai_disclosure,
      a.aiDisclosure !== undefined,
    );
    return {
      title: a.title,
      url: absUrl,
      id: absUrl,
      updated: ts.includes("T") ? ts : `${ts}T00:00:00Z`,
      summary: a.description,
      digitalSourceCode:
        pageFlags.atom && a.aiDisclosure
          ? a.aiDisclosure.digitalSourceCode
          : undefined,
    };
  });
  if (buildOutputs.feed) {
    writeFileSync(
      join(outDir, "feed.xml"),
      buildAtomFeed(feedEntries, {
        siteTitle: config.site.title,
        siteDescription: config.site.description,
        baseUrl,
      }),
      "utf8",
    );
  }

  if (buildOutputs.robots) {
    writeFileSync(
      join(outDir, "robots.txt"),
      buildRobotsTxt(baseUrl, { disallow: siteFindability.disallow }),
      "utf8",
    );
  }
  if (buildOutputs.sitemap) {
    writeFileSync(
      join(outDir, "sitemap.xml"),
      buildSitemapXml(siteEntries, baseUrl),
      "utf8",
    );
  }
  const dcatCatalogEnabled = config.site.open_data?.dcat_catalog === true;
  const llmsExtraSections = [
    siteLicense ? llmsLicenseSection(siteLicense, baseUrl).join("\n") : "",
    llmsContactSection({
      contact: config.site.contact,
      organization: siteOrganization,
      baseUrl,
    }).join("\n"),
    llmsHostingSection(config.site, baseUrl).join("\n"),
  ].filter((s) => s.length > 0);
  if (buildOutputs.llms_txt) {
    writeFileSync(
      join(outDir, "llms.txt"),
      buildLlmsTxt({
        siteTitle: config.site.title,
        siteDescription: config.site.description,
        baseUrl,
        aiLabeledCount: siteAiFlags.machineReadable ? aiLabeledCount : undefined,
        diagramsEnabled: diagramConfig.enabled !== false,
        dcatCatalog: dcatCatalogEnabled,
        extraSections: llmsExtraSections,
      }),
      "utf8",
    );
  }

  const cloudflareOps = buildCloudflareOpsManifest(config.site);
  if (cloudflareOps) {
    const opsDir = join(outDir, "ops");
    mkdirSync(opsDir, { recursive: true });
    writeFileSync(
      join(opsDir, "cloudflare.json"),
      `${JSON.stringify(cloudflareOps, null, 2)}\n`,
      "utf8",
    );
  }
  if (buildOutputs.catalog) {
    writeFileSync(
      join(outDir, "catalog.jsonld"),
      buildCatalogJsonLd(catalogInputs, config.site.title, baseUrl, {
        machineReadable: siteAiFlags.machineReadable,
        docsMode,
        translationMap,
        publisher: siteOrganization
          ? {
              name: siteOrganization.name,
              url: siteOrganization.url,
              type: siteOrganization.type,
            }
          : undefined,
      }),
      "utf8",
    );
  }
  if (dcatCatalogEnabled && buildOutputs.catalog) {
    const dcatJson = buildCatalogDcatJsonLd(
      catalogInputs,
      config.site.title,
      baseUrl,
      {
        siteDescription: config.site.description,
        defaultLicense: config.site.open_data?.default_license,
        publisher: siteOrganization
          ? {
              name: siteOrganization.name,
              url: siteOrganization.url,
              type: siteOrganization.type,
            }
          : undefined,
      },
    );
    if (dcatJson) {
      writeFileSync(join(outDir, "catalog-dcat.jsonld"), dcatJson, "utf8");
    }
  }
  if (aiLabeledCount > 0) {
    process.stdout.write(
      `[sorane] AI disclosure: ${aiLabeledCount} labeled article(s)\n`,
    );
  }

  const conceptBundleEntries = buildBundleEntries(
    parsed
      .filter(
        (p) =>
          p.concept.type !== "index" &&
          slugFromRel(p.relPath) !== "index" &&
          !isNotFoundSource(p.relPath),
      )
      .map((p) => ({
        concept: p.concept,
        slug: slugFromRel(p.relPath),
      })),
  );
  const bundleEntries = [
    ...conceptBundleEntries,
    ...directoryIndexBundleRows.map((row) => ({
      path: row.path,
      content: row.content,
    })),
  ].sort((a, b) => a.path.localeCompare(b.path));
  if (buildOutputs.okf_bundle) {
    writeFileSync(join(outDir, "okf/bundle.tar.gz"), gzipSync(tarBytes(bundleEntries)));
  }

  const templateCss = resolveThemeCss(cwd);
  if (templateCss) {
    copyFileSync(templateCss, join(outDir, "assets/main.css"));
  } else {
    writeFileSync(join(outDir, "assets/main.css"), DEFAULT_CSS, "utf8");
  }
  const templatePrintCss = resolveThemeAssetFile(cwd, "print.css");
  if (templatePrintCss) {
    copyFileSync(templatePrintCss, join(outDir, "assets/print.css"));
  }

  if (hasAnyDisclosure) {
    const aiLabelsSrc = resolveThemeAssetDir(cwd, "ai-labels");
    if (aiLabelsSrc) {
      cpSync(aiLabelsSrc, join(outDir, "assets/ai-labels"), { recursive: true });
    }
  }

  emitDiagramAssets({
    cwd,
    outDir,
    config: diagramConfig,
    contentHasMermaid: contentHasMermaidFences(mdFiles),
    onProgress: (message) => process.stdout.write(`[sorane] ${message}\n`),
  });

  // --- 404.html（Cloudflare Pages 等のエラーページ）---
  const notFoundParsed = parsed.find((p) => isNotFoundSource(p.relPath));
  const staticSrc = resolve(cwd, staticDirName);
  const staticNotFoundHtml = join(staticSrc, "404.html");

  if (notFoundParsed) {
    const rootPrefix = "./";
    const section = await renderBodySectionForConfig(
      notFoundBodySource(notFoundParsed.concept),
      bodySectionOpts(rootPrefix),
    );
    const bodyHtml = renderCustomNotFoundBody(
      notFoundParsed.concept,
      section.html,
      config.site.lang,
    );
    const fontCss = await fontCssFor(
      notFoundParsed.concept,
      rootPrefix,
      i18n.defaultLang,
      bodyHtml,
    );
    const notFoundChrome = headerSearchFor("./", { isSearch: false });
    emitPage({
      ...pageEmitBase,
      cwd,
      config,
      outDir,
      outRel: "404.html",
      concept: notFoundParsed.concept,
      bodyHtml,
      baseUrl,
      fontCss,
      showArchiveNav: showArchiveInHeader,
      searchPath: searchNavPath,
      pageKind: "website",
      headerSearchHtml: notFoundChrome.headerSearchHtml,
      extraHead: notFoundChrome.extraHead,
    });
    builtPages += 1;
  } else if (existsSync(staticNotFoundHtml)) {
    copyFileSync(staticNotFoundHtml, join(outDir, "404.html"));
    builtPages += 1;
  } else {
    const concept = syntheticConcept(
      notFoundLabels(config.site.lang).heading,
      config.site.description,
    );
    const bodyHtml = renderDefaultNotFoundBody(config.site.lang);
    const defaultNotFoundChrome = headerSearchFor("./", { isSearch: false });
    emitPage({
      ...pageEmitBase,
      cwd,
      config,
      outDir,
      outRel: "404.html",
      concept,
      bodyHtml,
      baseUrl,
      showArchiveNav: showArchiveInHeader,
      searchPath: searchNavPath,
      pageKind: "website",
      headerSearchHtml: defaultNotFoundChrome.headerSearchHtml,
      extraHead: defaultNotFoundChrome.extraHead,
    });
    builtPages += 1;
  }

  const inlineImageCandidates = parsed.flatMap((p) =>
    collectMarkdownImageRefs({
      body: p.concept.body,
      sourceMdRel: p.relPath,
      outHtmlRel: outHtmlRelForParsed(p, config, i18n),
      contentDir,
      cwd,
      staticDirName,
    }),
  );
  const inlineImages = dedupeMarkdownImageRefs(inlineImageCandidates);

  await processStaticAssets({
    cwd,
    staticSrc,
    outDir,
    staticDirName,
    contentDir,
    c2pa: config.build.c2pa,
    imageMetadata: config.build.image_metadata,
    skipC2pa: opts.skipC2pa,
    inlineImages,
    onWarning: (message) => process.stderr.write(`[sorane] ${message}\n`),
    onProgress: (message) => process.stdout.write(`[sorane] ${message}\n`),
  });

  const { rules: redirectRules } = collectAllRedirectRules(parsed, config, i18n);
  if (redirectRules.length > 0) {
    writeFileSync(join(outDir, "_redirects"), formatRedirectsFile(redirectRules), "utf8");
    process.stdout.write(`[sorane] redirects: ${redirectRules.length} rule(s) → _redirects\n`);
  }

  if (searchPageRel) {
    try {
      const { emitSearchAssets } = await import("@sorane/search");
      await emitSearchAssets({
        cwd,
        outDir,
        indexPath: indexDbPath,
        mode: searchMode,
        modelRoot: config.search.model,
        modelId: config.search.model_id,
        bundleModel: config.search.bundle_model,
        assetBaseUrl: config.search.asset_base_url || undefined,
        contentDir,
        machineReadable: siteAiFlags.machineReadable,
        sourceToUrl: (source) => sourceToUrl.get(source) ?? source.replace(/\.md$/i, ".html"),
        onProgress: (message) => process.stdout.write(`[sorane] ${message}\n`),
      });
    } catch (err) {
      const { isOptionalModuleMissing, warnOptionalPackageMissing } = await import(
        "./optional-dep.ts"
      );
      if (isOptionalModuleMissing(err)) {
        warnOptionalPackageMissing(
          { packageName: "@sorane/search", feature: "search page assets" },
          cwd,
        );
        process.stderr.write("[sorane] skipping search assets\n");
      } else {
        throw err;
      }
    }
  }

  return { pages: builtPages, errors: 0, durationMs: performance.now() - startedAt };
}