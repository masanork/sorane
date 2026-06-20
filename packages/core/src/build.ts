import { createFontProcessor } from "@sorane/font";
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
  type ArticleListEntry,
  type ArticleNav,
} from "./ssg.ts";
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

function frontmatterString(
  frontmatter: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = frontmatter[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
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
  const nav: ArticleNav = {};
  if (i > 0) {
    const prev = summaries[i - 1]!;
    nav.prev = { href: prev.href, title: prev.title };
  }
  if (i < summaries.length - 1) {
    const next = summaries[i + 1]!;
    nav.next = { href: next.href, title: next.title };
  }
  return nav.prev || nav.next ? nav : undefined;
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

  const blogOpts = {
    page_size: config.build.blog?.page_size ?? 50,
    archives: config.build.blog?.archives ?? true,
    tags: config.build.blog?.tags ?? true,
  };

  const articleSummaries: ArticleListEntry[] = parsed
    .filter((p) => p.concept.type === "article" && !isSystemPage(p.concept))
    .map((p) => {
      const slug = slugFromRel(p.relPath);
      const outRel = resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
      return {
        title: p.concept.title,
        href: outRel,
        timestamp: p.concept.timestamp,
        updated: frontmatterString(p.concept.frontmatter, "updated"),
        author: frontmatterString(p.concept.frontmatter, "author"),
        description: p.concept.description ?? extractDescription(p.concept.body) ?? undefined,
        tags: p.concept.tags,
      };
    })
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

  const parsedByHref = new Map<string, ParsedConcept>();
  for (const p of parsed) {
    if (p.concept.type !== "article" || isSystemPage(p.concept)) continue;
    const slug = slugFromRel(p.relPath);
    const outRel = resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
    parsedByHref.set(outRel, p);
  }

  const indexParsed = parsed.find(
    (p) => p.concept.type === "index" || slugFromRel(p.relPath) === "index",
  );

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
  let searchNavPath: string | undefined;
  if (searchPageRel && existsSync(indexDbPath)) {
    const { IndexStore } = await import("@sorane/search");
    const probe = new IndexStore(indexDbPath);
    if (probe.hasVectors()) searchNavPath = searchPageRel;
    probe.close();
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
  ): Promise<string | undefined> {
    if (!fontProcessor) return undefined;
    return fontProcessor.fontCssForPage({
      body: concept.body,
      title: concept.title,
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
    const nav = isSearch ? undefined : articleNavFor(outRel, articleSummaries);
    const bodyHtml = isSearch
      ? buildSearchMount(rootPrefix, config.search.asset_base_url) +
        (p.concept.body.trim()
          ? `<div class="search-intro">${renderMarkdown(p.concept.body)}</div>`
          : "")
      : renderArticleBody(p.concept, nav);

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
        });

    const fontCss = await fontCssFor(p.concept, rootPrefix);
    const extraHead = isSearch
      ? buildSearchHead(rootPrefix)
      : jsonLd
        ? [jsonLd]
        : undefined;
    emitPage({
      cwd,
      config,
      outDir,
      outRel,
      concept: p.concept,
      bodyHtml,
      baseUrl,
      fontCss,
      extraHead,
      showArchiveNav: Boolean(indexParsed) && blogOpts.archives,
      searchPath: searchNavPath,
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
    if (useBlogLayout) {
      bodyHtml = renderBlogIndexBody({
        siteTitle: p.concept.title || config.site.title,
        description: p.concept.description ?? config.site.description,
        profileUrl: frontmatterString(p.concept.frontmatter, "profileUrl"),
        introHtml: p.concept.body.trim() ? renderMarkdown(p.concept.body) : undefined,
        latestArticle: latestParsed
          ? {
              title: latestParsed.concept.title,
              href: latest!.href,
              timestamp: latestParsed.concept.timestamp,
              updated: frontmatterString(latestParsed.concept.frontmatter, "updated"),
              author: frontmatterString(latestParsed.concept.frontmatter, "author"),
              bodyHtml: renderMarkdown(latestParsed.concept.body),
            }
          : undefined,
        articles: archivePages[0] ?? [],
        archiveLimit: blogOpts.page_size,
      });
      if (archivePages.length > 1) {
        bodyHtml +=
          `<p class="blog-more-pages"><a href="page/2.html">さらに過去の記事を見る →</a></p>\n`;
      }
    } else {
      bodyHtml = renderIndexBody(config.site.title, archivePages[0] ?? articleSummaries);
    }

    const fontCss = await fontCssFor(p.concept, "./");
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
      showArchiveNav: blogOpts.archives,
      searchPath: searchNavPath,
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
          page: pageNum,
          totalPages: archivePages.length,
          basePath: "index.html",
        },
      );
      emitPage({
        cwd,
        config,
        outDir,
        outRel,
        concept: syntheticConcept(`${config.site.title} — ページ ${pageNum}`),
        bodyHtml,
        baseUrl,
        searchPath: searchNavPath,
      });
      builtPages += 1;
      siteEntries.push({ url: outRel, lastmod: undefined, isIndex: false });
    }
  }

  if (indexParsed && blogOpts.archives && articleSummaries.length > 0) {
    const byYear = groupByYear(articleSummaries);
    const byMonth = groupByYearMonth(articleSummaries);

    const archiveIndexHtml = renderYearArchiveIndexBody(config.site.title, byYear);
    emitPage({
      cwd,
      config,
      outDir,
      outRel: "archive/index.html",
      concept: syntheticConcept(`${config.site.title} — 年別アーカイブ`),
      bodyHtml: archiveIndexHtml,
      baseUrl,
      searchPath: searchNavPath,
    });
    builtPages += 1;
    siteEntries.push({ url: "archive/index.html", lastmod: undefined, isIndex: false });

    for (const year of [...byYear.keys()].sort((a, b) => b.localeCompare(a))) {
      const yearHtml = renderMonthListForYear(year, byMonth);
      emitPage({
        cwd,
        config,
        outDir,
        outRel: `archive/${year}.html`,
        concept: syntheticConcept(`${year}年`),
        bodyHtml: yearHtml,
        baseUrl,
        searchPath: searchNavPath,
      });
      builtPages += 1;
      siteEntries.push({ url: `archive/${year}.html`, lastmod: undefined, isIndex: false });
    }

    for (const ym of [...byMonth.keys()].sort((a, b) => b.localeCompare(a))) {
      const monthArticles = byMonth.get(ym)!;
      const [y, m] = ym.split("-");
      const bodyHtml = renderArchiveListBody(`${y}年${m}月`, undefined, monthArticles);
      emitPage({
        cwd,
        config,
        outDir,
        outRel: `archive/${ym}.html`,
        concept: syntheticConcept(`${y}年${m}月`),
        bodyHtml,
        baseUrl,
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
      const bodyHtml = renderArchiveListBody(`タグ: ${label}`, undefined, tagged);
      emitPage({
        cwd,
        config,
        outDir,
        outRel: `tag/${tagSlug}.html`,
        concept: syntheticConcept(`タグ: ${label}`),
        bodyHtml,
        baseUrl,
        searchPath: searchNavPath,
      });
      builtPages += 1;
      siteEntries.push({ url: `tag/${tagSlug}.html`, lastmod: undefined, isIndex: false });
    }
  }

  const feedEntries: FeedEntry[] = articleSummaries.slice(0, 30).map((a) => {
    const absUrl = baseUrl.length > 0 ? `${baseUrl}/${a.href}` : a.href;
    const ts = a.timestamp ?? new Date().toISOString();
    return {
      title: a.title,
      url: absUrl,
      id: absUrl,
      updated: ts.includes("T") ? ts : `${ts}T00:00:00Z`,
      summary: a.description,
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
    }),
    "utf8",
  );
  writeFileSync(
    join(outDir, "catalog.jsonld"),
    buildCatalogJsonLd(catalogInputs, config.site.title, baseUrl),
    "utf8",
  );

  const bundleEntries = buildBundleEntries(
    parsed
      .filter((p) => p.concept.type !== "index" && slugFromRel(p.relPath) !== "index")
      .map((p) => ({
        concept: p.concept,
        slug: slugFromRel(p.relPath),
      })),
  );
  writeFileSync(join(outDir, "okf/bundle.tar.gz"), gzipSync(tarBytes(bundleEntries)));

  const templateCss = resolve(cwd, "templates/default/assets/main.css");
  if (existsSync(templateCss)) {
    copyFileSync(templateCss, join(outDir, "assets/main.css"));
  } else {
    writeFileSync(join(outDir, "assets/main.css"), DEFAULT_CSS, "utf8");
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
    modelRoot: config.search.model,
    modelId: config.search.model_id,
    assetBaseUrl: config.search.asset_base_url || undefined,
    sourceToUrl: (source) => sourceToUrl.get(source) ?? source.replace(/\.md$/i, ".html"),
    onProgress: (message) => process.stdout.write(`[sorane] ${message}\n`),
  });

  return { pages: builtPages, errors: 0 };
}