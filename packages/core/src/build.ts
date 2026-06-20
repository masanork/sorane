import { createFontProcessor, plainTextFromHtml } from "@sorane/font";
import { emitSearchAssets } from "@sorane/search";
import {
  parseConcept,
  buildBundleEntries,
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
import { buildCatalogJsonLd } from "./catalog.ts";
import { mergeConfig, resolvePermalink, type SoraneConfig } from "./config.ts";
import {
  buildBlogPostingJsonLd,
  extractDescription,
  renderArticleBody,
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
import { siteChromeText } from "./site-labels.ts";
import type { OkfConcept } from "@sorane/okf";
import {
  buildAtomFeed,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  type FeedEntry,
  type SiteEntry,
} from "./site-meta.ts";
import { renderMarkdown } from "./render.ts";
import { resolveThemeAssetDir } from "./theme-assets.ts";
import {
  docsNavFor,
  docsSidebarHtml,
  renderDocsArticleFromConcept,
  renderDocsIndexBody,
  resolveDocsNav,
} from "./docs.ts";

export interface BuildOptions {
  readonly cwd: string;
  readonly config: Partial<SoraneConfig>;
  readonly clean?: boolean;
}

export interface BuildResult {
  readonly pages: number;
  readonly errors: number;
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

function isSystemPage(concept: ParsedConcept["concept"]): boolean {
  return concept.frontmatter.isSystem === true;
}

function isBlogArticle(concept: ParsedConcept["concept"]): boolean {
  return (
    concept.type === "article" &&
    !isSystemPage(concept) &&
    !isSearchView(concept.frontmatter) &&
    concept.frontmatter.excludeFromList !== true
  );
}

function frontmatterString(
  frontmatter: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = frontmatter[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** index.md 本文がタイトルと同じ見出しだけなら intro を出さない。 */
function introHtmlFromBody(body: string, title: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  const onlyH1 = /^#\s+(.+?)\s*$/s.exec(trimmed);
  if (onlyH1 && onlyH1[1]!.trim() === title.trim()) return undefined;
  return renderMarkdown(body);
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

function tarBytes(entries: Array<{ path: string; content: string }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content, "utf8");
    const header = Buffer.alloc(512, 0);
    header.write(entry.path.slice(0, 100), 0, "ascii");
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
export function resolveThemeCss(cwd: string): string | null {
  const rel = join("templates", "default", "assets", "main.css");
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
  const { cwd } = opts;
  const config = mergeConfig(opts.config);
  const contentDir = resolve(cwd, config.build.content_dir);
  const outDir = resolve(cwd, config.build.out_dir);

  if (!existsSync(contentDir)) {
    throw new Error(`content directory not found: ${contentDir}`);
  }

  if (opts.clean && existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(join(outDir, "okf"), { recursive: true });
  mkdirSync(join(outDir, "assets"), { recursive: true });

  const mdFiles = walkMarkdown(contentDir);
  const parsed: ParsedConcept[] = [];
  let errors = 0;

  for (const abs of mdFiles) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    const p = parseConcept(abs, rel, source);
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
    .filter((p) => isBlogArticle(p.concept))
    .map((p) => {
      const slug = slugFromRel(p.relPath);
      const outRel = resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
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
    if (!isBlogArticle(p.concept)) continue;
    const slug = slugFromRel(p.relPath);
    const outRel = resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
    parsedByHref.set(outRel, p);
  }

  const indexParsed = parsed.find(
    (p) => p.concept.type === "index" || slugFromRel(p.relPath) === "index",
  );

  const titleByHref = new Map<string, string>();
  for (const p of parsed) {
    const slug = slugFromRel(p.relPath);
    const outRel =
      p.concept.type === "index" || slug === "index"
        ? "index.html"
        : resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
    titleByHref.set(outRel, p.concept.title);
  }
  const docsNav = resolveDocsNav(config.docs?.nav, titleByHref);
  const docsMode = docsNav.length > 0;
  const docsHrefSet = new Set(docsNav.map((item) => item.href));

  const fontProcessor = await createFontProcessor(cwd, config.fonts, outDir);

  const sourceToUrl = new Map<string, string>();
  let searchPageRel: string | undefined;
  for (const p of parsed) {
    const rel = p.relPath.replace(/\\/g, "/");
    const slug = slugFromRel(p.relPath);
    const outRel =
      p.concept.type === "index" || slug === "index"
        ? "index.html"
        : resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
    if (!isSystemPage(p.concept)) {
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
  }
  const headerSearchEnabled = docsMode && searchIndexReady;
  const searchNavPath = headerSearchEnabled || !searchIndexReady ? undefined : searchPageRel;

  function headerSearchFor(
    rootPrefix: string,
    page: { readonly docsLayout?: boolean; readonly isSearch?: boolean },
  ): { readonly headerSearchHtml?: string; readonly extraHead?: string[] } {
    if (!headerSearchEnabled || !page.docsLayout || page.isSearch) return {};
    return {
      headerSearchHtml: buildSearchMount(rootPrefix, {
        assetBaseUrl: config.search.asset_base_url,
        mode: searchMode,
        variant: "header",
      }),
      extraHead: buildSearchHead(rootPrefix, searchMode),
    };
  }

  const siteEntries: SiteEntry[] = [];
  const catalogInputs: Array<{
    slug: string;
    url: string;
    concept: ParsedConcept["concept"];
  }> = [];
  let builtPages = 0;

  async function fontCssFor(
    concept: ParsedConcept["concept"],
    rootPrefix: string,
    renderedHtml?: string,
  ): Promise<string | undefined> {
    if (!fontProcessor) return undefined;
    const chrome = siteChromeText(
      config.site.lang,
      config.site.title,
      Boolean(searchNavPath),
    );
    const extraText =
      (renderedHtml ? plainTextFromHtml(renderedHtml) : "") + chrome;
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

  // --- Phase A: articles（SSG の核）---
  for (const p of parsed) {
    if (p.concept.type !== "article" || isSystemPage(p.concept)) continue;

    const slug = slugFromRel(p.relPath);
    const outRel = resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
    const depth = outRel.replace(/\\/g, "/").split("/").length - 1;
    const rootPrefix = depth > 0 ? "../".repeat(depth) : "./";
    const isSearch = isSearchView(p.concept.frontmatter);
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
            lang: config.site.lang,
            rootPrefix,
            policyUrl: pageAiFlags.policyUrl,
          })
        : "";
    const bodyHtml = isSearch
      ? buildSearchMount(rootPrefix, {
          assetBaseUrl: config.search.asset_base_url,
          mode: searchMode,
        }) +
        (p.concept.body.trim()
          ? `<div class="search-intro">${renderMarkdown(p.concept.body)}</div>`
          : "")
      : isDocsPage
        ? renderDocsArticleFromConcept(p.concept, nav, config.site.lang, {
            badgeHtml,
          })
        : renderArticleBody(p.concept, nav, { badgeHtml });

    const updated = frontmatterString(p.concept.frontmatter, "updated");
    const author = frontmatterString(p.concept.frontmatter, "author");
    const canonicalUrl = baseUrl.length > 0 ? `${baseUrl}/${outRel}` : undefined;
    const jsonLd = isSearch
      ? ""
      : buildBlogPostingJsonLd({
          title: p.concept.title,
          description: p.concept.description ?? extractDescription(p.concept.body) ?? undefined,
          url: canonicalUrl ?? outRel,
          datePublished: p.concept.timestamp,
          dateModified: updated ?? p.concept.timestamp,
          author,
          siteTitle: config.site.title,
          lang: config.site.lang,
          aiDisclosure:
            pageAiFlags.jsonLd && aiDisclosure ? aiDisclosure : undefined,
        });

    const fontCss = await fontCssFor(p.concept, rootPrefix, bodyHtml);
    const headerSearch = headerSearchFor(rootPrefix, {
      docsLayout: isDocsPage,
      isSearch,
    });
    const extraHead = isSearch
      ? buildSearchHead(rootPrefix, searchMode)
      : [
          ...(jsonLd ? [jsonLd] : []),
          ...(headerSearch.extraHead ?? []),
        ];
    emitPage({
      cwd,
      config,
      outDir,
      outRel,
      concept: p.concept,
      bodyHtml,
      baseUrl,
      fontCss,
      extraHead: extraHead.length > 0 ? extraHead : undefined,
      showArchiveNav: Boolean(indexParsed) && blogOpts.archives,
      searchPath: searchNavPath,
      docsLayout: isDocsPage,
      docsSidebarHtml: isDocsPage ? docsSidebarHtml(docsNav, outRel, outRel) : undefined,
      headerSearchHtml: headerSearch.headerSearchHtml,
    });
    builtPages += 1;

    siteEntries.push({ url: outRel, lastmod: p.concept.timestamp, isIndex: false });
    catalogInputs.push({
      slug,
      url: canonicalUrl ?? outRel,
      concept: p.concept,
    });
  }

  // --- Phase B: index（任意 — content/index.md がある場合のみ）---
  const listForPagination = indexParsed && articleSummaries[0]
    ? articleSummaries.slice(1)
    : articleSummaries;
  const archivePages = paginate(listForPagination, blogOpts.page_size);

  if (indexParsed) {
    const p = indexParsed;
    const latest = articleSummaries[0];
    const latestParsed = latest ? parsedByHref.get(latest.href) : undefined;
    const useBlogLayout = p.concept.type === "index";

    let bodyHtml: string;
    if (docsMode && useBlogLayout) {
      bodyHtml = renderDocsIndexBody({
        siteTitle: p.concept.title || config.site.title,
        description: p.concept.description ?? config.site.description,
        profileUrl: frontmatterString(p.concept.frontmatter, "profileUrl"),
        githubUrl: frontmatterString(p.concept.frontmatter, "githubUrl"),
        introHtml: introHtmlFromBody(p.concept.body, p.concept.title || config.site.title),
        docsNav,
        lang: config.site.lang,
      });
    } else if (useBlogLayout) {
      const featuredMode = blogOpts.featured_mode;
      const featuredBody =
        latestParsed && featuredMode !== "off"
          ? featuredMode === "full"
            ? renderMarkdown(latestParsed.concept.body)
            : renderFeaturedExcerpt(latestParsed.concept, blogOpts.excerpt_length)
          : "";
      bodyHtml = renderBlogIndexBody({
        siteTitle: p.concept.title || config.site.title,
        description: p.concept.description ?? config.site.description,
        showHeaderTitle: false,
        profileUrl: frontmatterString(p.concept.frontmatter, "profileUrl"),
        githubUrl: frontmatterString(p.concept.frontmatter, "githubUrl"),
        introHtml: introHtmlFromBody(p.concept.body, p.concept.title || config.site.title),
        lang: config.site.lang,
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
      });
      if (archivePages.length > 1) {
        bodyHtml +=
          `<p class="blog-more-pages"><a href="page/2.html">さらに過去の記事を見る →</a></p>\n`;
      }
    } else {
      bodyHtml = renderIndexBody(config.site.title, archivePages[0] ?? articleSummaries);
    }

    const fontCss = await fontCssFor(p.concept, "./", bodyHtml);
    const indexCanonical =
      baseUrl.length > 0 ? `${baseUrl}/index.html` : undefined;
    const indexJsonLd = buildWebSiteJsonLd({
      title: p.concept.title || config.site.title,
      description: p.concept.description ?? config.site.description,
      url: indexCanonical,
      lang: config.site.lang,
    });
    const indexHeaderSearch = headerSearchFor("./", { docsLayout: docsMode });
    const indexExtraHead = [
      indexJsonLd,
      ...(indexHeaderSearch.extraHead ?? []),
    ];
    emitPage({
      cwd,
      config,
      outDir,
      outRel: "index.html",
      concept: p.concept,
      bodyHtml,
      baseUrl,
      fontCss,
      isIndex: true,
      pageKind: "website",
      extraHead: indexExtraHead,
      showArchiveNav: blogOpts.archives,
      searchPath: searchNavPath,
      docsLayout: docsMode,
      docsSidebarHtml: docsMode
        ? docsSidebarHtml(docsNav, "index.html", "index.html")
        : undefined,
      headerSearchHtml: indexHeaderSearch.headerSearchHtml,
    });
    builtPages += 1;
    siteEntries.push({ url: "index.html", lastmod: undefined, isIndex: true });
  }

  // --- Phase C: 派生ブログページ（index がある場合）---
  if (indexParsed) {
    for (let i = 1; i < archivePages.length; i++) {
      const pageNum = i + 1;
      const outRel = `page/${pageNum}.html`;
      const bodyHtml = renderArchiveListBody(
        `${config.site.title} — ページ ${pageNum}`,
        undefined,
        archivePages[i]!,
        {
          fromRel: outRel,
          page: pageNum,
          totalPages: archivePages.length,
          showOnLists: siteAiFlags.showOnLists,
        },
      );
      const concept = syntheticConcept(`${config.site.title} — ページ ${pageNum}`);
      const fontCss = await fontCssFor(concept, rootPrefixFromRel(outRel), bodyHtml);
      emitPage({
        cwd,
        config,
        outDir,
        outRel,
        concept,
        bodyHtml,
        baseUrl,
        fontCss,
        searchPath: searchNavPath,
      });
      builtPages += 1;
      siteEntries.push({ url: outRel, lastmod: undefined, isIndex: false });
    }
  }

  if (indexParsed && blogOpts.archives && articleSummaries.length > 0) {
    const byYear = groupByYear(articleSummaries);
    const byMonth = groupByYearMonth(articleSummaries);

    const archiveIndexHtml = renderYearArchiveIndexBody(
      config.site.title,
      byYear,
      "archive/index.html",
    );
    const archiveIndexConcept = syntheticConcept(`${config.site.title} — 年別アーカイブ`);
    const archiveIndexFontCss = await fontCssFor(
      archiveIndexConcept,
      rootPrefixFromRel("archive/index.html"),
      archiveIndexHtml,
    );
    emitPage({
      cwd,
      config,
      outDir,
      outRel: "archive/index.html",
      concept: archiveIndexConcept,
      bodyHtml: archiveIndexHtml,
      baseUrl,
      fontCss: archiveIndexFontCss,
      searchPath: searchNavPath,
    });
    builtPages += 1;
    siteEntries.push({ url: "archive/index.html", lastmod: undefined, isIndex: false });

    for (const year of [...byYear.keys()].sort((a, b) => b.localeCompare(a))) {
      const yearOutRel = `archive/${year}.html`;
      const yearHtml = renderMonthListForYear(year, byMonth, yearOutRel);
      const yearConcept = syntheticConcept(`${year}年`);
      const yearFontCss = await fontCssFor(yearConcept, rootPrefixFromRel(yearOutRel), yearHtml);
      emitPage({
        cwd,
        config,
        outDir,
        outRel: yearOutRel,
        concept: yearConcept,
        bodyHtml: yearHtml,
        baseUrl,
        fontCss: yearFontCss,
        searchPath: searchNavPath,
      });
      builtPages += 1;
      siteEntries.push({ url: `archive/${year}.html`, lastmod: undefined, isIndex: false });
    }

    for (const ym of [...byMonth.keys()].sort((a, b) => b.localeCompare(a))) {
      const monthArticles = byMonth.get(ym)!;
      const [y, m] = ym.split("-");
      const monthOutRel = `archive/${ym}.html`;
      const bodyHtml = renderArchiveListBody(`${y}年${m}月`, undefined, monthArticles, {
        fromRel: monthOutRel,
        showOnLists: siteAiFlags.showOnLists,
      });
      const monthConcept = syntheticConcept(`${y}年${m}月`);
      const monthFontCss = await fontCssFor(monthConcept, rootPrefixFromRel(monthOutRel), bodyHtml);
      emitPage({
        cwd,
        config,
        outDir,
        outRel: monthOutRel,
        concept: monthConcept,
        bodyHtml,
        baseUrl,
        fontCss: monthFontCss,
        searchPath: searchNavPath,
      });
      builtPages += 1;
      siteEntries.push({ url: `archive/${ym}.html`, lastmod: undefined, isIndex: false });
    }
  }

  if (indexParsed && blogOpts.tags) {
    const byTag = groupByTag(articleSummaries);
    for (const [tagSlug, tagged] of byTag) {
      const label = tagged[0]?.tags?.find((t) => slugifyTag(t) === tagSlug) ?? tagSlug;
      const tagOutRel = `tag/${tagSlug}.html`;
      const bodyHtml = renderArchiveListBody(`タグ: ${label}`, undefined, tagged, {
        fromRel: tagOutRel,
        showOnLists: siteAiFlags.showOnLists,
      });
      const tagConcept = syntheticConcept(`タグ: ${label}`);
      const tagFontCss = await fontCssFor(tagConcept, rootPrefixFromRel(tagOutRel), bodyHtml);
      emitPage({
        cwd,
        config,
        outDir,
        outRel: tagOutRel,
        concept: tagConcept,
        bodyHtml,
        baseUrl,
        fontCss: tagFontCss,
        searchPath: searchNavPath,
      });
      builtPages += 1;
      siteEntries.push({ url: `tag/${tagSlug}.html`, lastmod: undefined, isIndex: false });
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
  writeFileSync(
    join(outDir, "feed.xml"),
    buildAtomFeed(feedEntries, {
      siteTitle: config.site.title,
      siteDescription: config.site.description,
      baseUrl,
    }),
    "utf8",
  );

  writeFileSync(join(outDir, "robots.txt"), buildRobotsTxt(baseUrl), "utf8");
  writeFileSync(
    join(outDir, "sitemap.xml"),
    buildSitemapXml(siteEntries, baseUrl),
    "utf8",
  );
  writeFileSync(
    join(outDir, "llms.txt"),
    buildLlmsTxt({
      siteTitle: config.site.title,
      siteDescription: config.site.description,
      baseUrl,
      aiLabeledCount: siteAiFlags.machineReadable ? aiLabeledCount : undefined,
    }),
    "utf8",
  );
  writeFileSync(
    join(outDir, "catalog.jsonld"),
    buildCatalogJsonLd(catalogInputs, config.site.title, baseUrl, {
      machineReadable: siteAiFlags.machineReadable,
    }),
    "utf8",
  );
  if (aiLabeledCount > 0) {
    process.stdout.write(
      `[sorane] AI disclosure: ${aiLabeledCount} labeled article(s)\n`,
    );
  }

  const bundleEntries = buildBundleEntries(
    parsed
      .filter((p) => p.concept.type !== "index" && slugFromRel(p.relPath) !== "index")
      .map((p) => ({
        concept: p.concept,
        slug: slugFromRel(p.relPath),
      })),
  );
  writeFileSync(join(outDir, "okf/bundle.tar.gz"), gzipSync(tarBytes(bundleEntries)));

  const templateCss = resolveThemeCss(cwd);
  if (templateCss) {
    copyFileSync(templateCss, join(outDir, "assets/main.css"));
  } else {
    writeFileSync(join(outDir, "assets/main.css"), DEFAULT_CSS, "utf8");
  }

  const aiLabelsSrc = resolveThemeAssetDir(cwd, "ai-labels");
  if (aiLabelsSrc) {
    cpSync(aiLabelsSrc, join(outDir, "assets/ai-labels"), { recursive: true });
  }

  const staticDirName = config.build.static_dir ?? "static";
  const staticSrc = resolve(cwd, staticDirName);
  if (existsSync(staticSrc)) {
    cpSync(staticSrc, join(outDir, staticDirName), { recursive: true });
  }

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

  return { pages: builtPages, errors: 0 };
}