import { createFontProcessor } from "@sorane/font";
import {
  conceptToOkfMarkdown,
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
  buildPage,
  extractDescription,
  renderArticleBody,
  renderBlogIndexBody,
  renderIndexBody,
  rootPrefixFromRel,
  type ArticleListEntry,
} from "./ssg.ts";
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

  const fontProcessor = await createFontProcessor(cwd, config.fonts, outDir);

  const siteEntries: SiteEntry[] = [];
  const catalogInputs: Array<{
    slug: string;
    url: string;
    concept: ParsedConcept["concept"];
  }> = [];

  for (const p of parsed) {
    const slug = slugFromRel(p.relPath);
    const isIndex = p.concept.type === "index" || slug === "index";
    const outRel = isIndex
      ? "index.html"
      : resolvePermalink(config.build.permalink, slug, p.concept.timestamp);
    const outAbs = join(outDir, outRel);
    mkdirSync(dirname(outAbs), { recursive: true });

    const rootPrefix = isIndex ? "./" : rootPrefixFromRel(outRel);
    const description =
      p.concept.description ??
      extractDescription(p.concept.body) ??
      (isIndex ? config.site.description : undefined);
    const canonicalUrl = baseUrl.length > 0 ? `${baseUrl}/${outRel}` : undefined;

    const mdOutRel = outRel.replace(/\.html$/, ".md");
    writeFileSync(join(outDir, mdOutRel), conceptToOkfMarkdown(p.concept), "utf8");

    let bodyHtml: string;
    if (isIndex) {
      const latest = articleSummaries[0];
      const latestParsed = latest ? parsedByHref.get(latest.href) : undefined;
      const useBlogLayout = p.concept.type === "index";
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
          articles: latest ? articleSummaries.slice(1) : articleSummaries,
          archiveLimit: 100,
        });
      } else {
        bodyHtml = renderIndexBody(config.site.title, articleSummaries);
      }
    } else {
      bodyHtml = renderArticleBody(p.concept);
    }

    const fontCss = fontProcessor
      ? await fontProcessor.fontCssForPage({
          body: p.concept.body,
          title: p.concept.title,
          frontmatter: {
            ...p.concept.frontmatter,
            type: p.concept.type,
            noFontEmbedding: p.concept.frontmatter.noFontEmbedding,
          },
          rootPrefix,
        })
      : undefined;

    const html = buildPage({
      title: p.concept.title,
      siteTitle: config.site.title,
      bodyHtml,
      rootPrefix,
      description,
      canonicalUrl,
      lang: config.site.lang,
      feedPath: "feed.xml",
      machineSources: [{ href: mdOutRel, type: "text/markdown" }],
      extraHead: fontCss ? [fontCss] : undefined,
    });
    writeFileSync(outAbs, html, "utf8");

    siteEntries.push({
      url: outRel,
      lastmod: p.concept.timestamp,
      isIndex,
    });

    if (!isIndex) {
      catalogInputs.push({
        slug,
        url: canonicalUrl ?? outRel,
        concept: p.concept,
      });
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

  return { pages: parsed.length, errors: 0 };
}