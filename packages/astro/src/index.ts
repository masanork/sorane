import {
  buildCatalogJsonLd,
  buildLlmsTxt,
  buildSitemapXml,
  type CatalogEntry,
  type SiteEntry,
} from "@sorane/core";
import {
  buildOkfBundle,
  parseConcept,
  resolveEffectiveType,
  type ParsedConcept,
} from "@sorane/okf";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

type AstroLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

export type SoraneAstroPermalink = "html" | "directory";
export type SoraneAstroValidateMode = false | "warn" | "error";

export interface SoraneAstroSiteConfig {
  readonly title: string;
  readonly description: string;
  readonly baseUrl?: string;
}

export interface SoraneAstroOptions {
  /** Astro project root. The integration fills this from Astro when omitted. */
  readonly root?: string;
  /** Markdown/MDX source root, relative to root. Default: src/content. */
  readonly contentDir?: string;
  /** Astro build output directory. The integration fills this from Astro when omitted. */
  readonly outDir?: string;
  readonly site: SoraneAstroSiteConfig;
  /**
   * URL style for inferred content URLs.
   * `directory`: blog/post.md -> blog/post/index.html
   * `html`: blog/post.md -> blog/post.html
   */
  readonly permalink?: SoraneAstroPermalink;
  /**
   * Collection-to-route mapping. Example: { posts: "blog" } makes
   * src/content/posts/hello.md publish as blog/hello.html.
   */
  readonly collections?: Readonly<Record<string, string>>;
  readonly outputs?: {
    readonly catalog?: boolean;
    readonly llmsTxt?: boolean;
    readonly okfBundle?: boolean;
    readonly sitemap?: boolean;
  };
  /** Validate OKF frontmatter while emitting artifacts. Default: "warn". */
  readonly validate?: SoraneAstroValidateMode;
  readonly logger?: AstroLogger;
}

export interface SoraneAstroArtifactResult {
  readonly concepts: number;
  readonly files: readonly string[];
  readonly validationErrors: number;
  readonly validationWarnings: number;
}

type AstroIntegrationLike = {
  readonly name: string;
  readonly hooks: {
    readonly "astro:build:done": (args: {
      dir: URL;
      logger?: AstroLogger;
    }) => Promise<void>;
  };
};

function walkContent(root: string): string[] {
  const out: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else if (/\.(md|mdx)$/i.test(name)) out.push(abs);
    }
  }
  visit(root);
  return out;
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

function htmlRelForContent(
  relPath: string,
  opts: Pick<SoraneAstroOptions, "collections" | "permalink">,
): string {
  const withoutExt = relPath.replace(/\\/g, "/").replace(/\.(md|mdx)$/i, "");
  const parts = withoutExt.split("/");
  const collection = parts[0] ?? "";
  const routeBase = opts.collections?.[collection];
  const routeParts =
    routeBase === undefined ? parts : [trimSlashes(routeBase), ...parts.slice(1)];
  const cleanParts = routeParts.filter((p) => p.length > 0);
  const route = cleanParts.join("/");
  if (route === "" || route === "index") return "index.html";
  if (route.endsWith("/index")) return `${route.slice(0, -"index".length)}index.html`;
  if (opts.permalink === "directory") return `${route}/index.html`;
  return `${route}.html`;
}

function absoluteUrl(baseUrl: string, rel: string): string {
  if (baseUrl.length === 0) return rel;
  return `${baseUrl.replace(/\/$/, "")}/${rel.replace(/^\//, "")}`;
}

function slugForParsed(parsed: ParsedConcept): string {
  return parsed.relPath
    .replace(/\\/g, "/")
    .replace(/\.(md|mdx)$/i, "")
    .replace(/\/index$/i, "")
    .split("/")
    .filter(Boolean)
    .join("-") || "index";
}

function hasAiDisclosure(parsed: ParsedConcept): boolean {
  const fm = parsed.concept.frontmatter;
  return typeof fm.digitalSourceType === "string" || fm.aiDisclosureNote !== undefined;
}

function isAstroOkfContent(parsed: ParsedConcept): boolean {
  const effective = resolveEffectiveType(parsed.concept.type, parsed.concept.profile);
  return [
    "article",
    "index",
    "dataset",
    "reference",
    "glossary",
    "glossary-term",
    "faq",
  ].includes(effective);
}

function defaultOutputs(
  outputs: SoraneAstroOptions["outputs"],
): Required<NonNullable<SoraneAstroOptions["outputs"]>> {
  return {
    catalog: outputs?.catalog ?? true,
    llmsTxt: outputs?.llmsTxt ?? true,
    okfBundle: outputs?.okfBundle ?? true,
    sitemap: outputs?.sitemap ?? false,
  };
}

function validateMode(options: SoraneAstroOptions): SoraneAstroValidateMode {
  return options.validate ?? "warn";
}

function formatValidationIssue(parsed: ParsedConcept): string[] {
  const out: string[] = [];
  for (const issue of parsed.validation.issues) {
    out.push(`${parsed.relPath}: ${issue.message}`);
  }
  for (const warning of parsed.validation.warnings) {
    out.push(`${parsed.relPath}: ${warning}`);
  }
  return out;
}

export async function emitSoraneAstroArtifacts(
  options: SoraneAstroOptions,
): Promise<SoraneAstroArtifactResult> {
  const root = resolve(options.root ?? process.cwd());
  const contentDir = resolve(root, options.contentDir ?? "src/content");
  const outDir = resolve(root, options.outDir ?? "dist");
  const outputs = defaultOutputs(options.outputs);
  const logger = options.logger;

  if (!existsSync(contentDir)) {
    logger?.warn?.(`[sorane/astro] content directory not found: ${contentDir}`);
    return { concepts: 0, files: [], validationErrors: 0, validationWarnings: 0 };
  }

  mkdirSync(outDir, { recursive: true });

  const allParsed = walkContent(contentDir)
    .map((abs) => {
      const rel = relative(contentDir, abs).replace(/\\/g, "/");
      return parseConcept("", rel, readFileSync(abs, "utf8"));
    });
  const parsed = allParsed.filter(isAstroOkfContent);

  const catalogEntries: CatalogEntry[] = parsed.map((p) => {
    const urlRel = htmlRelForContent(p.relPath, options);
    return {
      slug: slugForParsed(p),
      url: absoluteUrl(options.site.baseUrl ?? "", urlRel),
      concept: p.concept,
    };
  });

  const validationErrors = allParsed.reduce(
    (sum, p) => sum + p.validation.issues.length,
    0,
  );
  const validationWarnings = allParsed.reduce(
    (sum, p) => sum + p.validation.warnings.length,
    0,
  );
  const mode = validateMode(options);
  if (mode !== false && validationErrors + validationWarnings > 0) {
    const details = allParsed.flatMap(formatValidationIssue);
    const message = `[sorane/astro] OKF validation found ${validationErrors} errors and ${validationWarnings} warnings\n${details.join("\n")}`;
    if (mode === "error" && validationErrors > 0) {
      throw new Error(message);
    }
    logger?.warn?.(message);
  }

  const files: string[] = [];

  if (outputs.catalog) {
    const target = join(outDir, "catalog.jsonld");
    writeFileSync(
      target,
      buildCatalogJsonLd(
        catalogEntries,
        options.site.title,
        options.site.baseUrl ?? "",
      ),
    );
    files.push("catalog.jsonld");
  }

  if (outputs.llmsTxt) {
    const target = join(outDir, "llms.txt");
    writeFileSync(
      target,
      buildLlmsTxt({
        siteTitle: options.site.title,
        siteDescription: options.site.description,
        baseUrl: options.site.baseUrl ?? "",
        aiLabeledCount: parsed.filter(hasAiDisclosure).length,
        extraSections: [
          "## Astro integration\n\nGenerated by `@sorane/astro`. Astro owns page rendering; sorane owns OKF and agent-readable publishing artifacts.",
          "## Native backends\n\nThe integration boundary is intentionally file-based so OKF parsing, validation, bundle creation, and search indexing can move to Rust/WASM or a Rust CLI without changing Astro routes.",
        ],
      }),
    );
    files.push("llms.txt");
  }

  if (outputs.okfBundle) {
    const targetDir = join(outDir, "okf");
    mkdirSync(targetDir, { recursive: true });
    const bundle = await buildOkfBundle(
      parsed.map((p) => ({ concept: p.concept, slug: slugForParsed(p) })),
    );
    writeFileSync(join(targetDir, "bundle.tar.gz"), bundle);
    files.push("okf/bundle.tar.gz");
  }

  if (outputs.sitemap) {
    const siteEntries: SiteEntry[] = catalogEntries.map((e) => ({
      url: e.url.startsWith("http") ? e.url.replace(`${options.site.baseUrl ?? ""}/`, "") : e.url,
      isIndex: resolveEffectiveType(e.concept.type, e.concept.profile) === "index",
      lastmod: e.concept.timestamp,
    }));
    writeFileSync(join(outDir, "sitemap.xml"), buildSitemapXml(siteEntries, options.site.baseUrl ?? ""));
    files.push("sitemap.xml");
  }

  logger?.info?.(`[sorane/astro] emitted ${files.length} artifacts for ${parsed.length} OKF concepts`);
  return {
    concepts: parsed.length,
    files,
    validationErrors,
    validationWarnings,
  };
}

export default function soraneAstro(options: SoraneAstroOptions): AstroIntegrationLike {
  return {
    name: "@sorane/astro",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        await emitSoraneAstroArtifacts({
          ...options,
          outDir: options.outDir ?? fileURLToPath(dir),
          logger: options.logger ?? logger,
        });
      },
    },
  };
}

export { soraneAstro };
