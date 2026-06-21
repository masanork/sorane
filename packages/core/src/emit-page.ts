import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ParsedConcept } from "@sorane/okf";
import { conceptToOkfMarkdown } from "@sorane/okf";
import { buildPage } from "./ssg.ts";
import type { SoraneConfig } from "./config.ts";
import { resolveOgImageUrl } from "./og-meta.ts";
import { extractDescription } from "./ssg.ts";
import type { HreflangAlternate } from "./i18n.ts";
import {
  emergencyBannerHtml,
  resolveEmergencyBanner,
} from "./emergency-banner.ts";
import { resolveBuildOutputs } from "./presets.ts";
import { resolveSiteLicense } from "./site-license.ts";

function pageOgImage(
  frontmatter: Record<string, unknown>,
  siteOgImage: string | undefined,
  baseUrl: string,
): string | undefined {
  const raw =
    typeof frontmatter.og_image === "string"
      ? frontmatter.og_image
      : typeof frontmatter.ogImage === "string"
        ? frontmatter.ogImage
        : siteOgImage;
  return resolveOgImageUrl(baseUrl, raw);
}

export interface EmitPageOptions {
  readonly cwd: string;
  readonly config: SoraneConfig;
  readonly outDir: string;
  readonly outRel: string;
  readonly concept: ParsedConcept["concept"];
  readonly bodyHtml: string;
  readonly baseUrl: string;
  readonly fontCss?: string;
  readonly extraHead?: string[];
  readonly isIndex?: boolean;
  readonly showArchiveNav?: boolean;
  readonly searchPath?: string;
  readonly pageKind?: "website" | "article";
  readonly docsLayout?: boolean;
  readonly docsSidebarHtml?: string;
  readonly headerSearchHtml?: string;
  readonly lang?: string;
  readonly hreflangAlternates?: readonly HreflangAlternate[];
  readonly ogLocaleAlternates?: readonly string[];
  readonly localeId?: string;
}

export function emitPage(opts: EmitPageOptions): { mdOutRel?: string; canonicalUrl?: string } {
  const outAbs = join(opts.outDir, opts.outRel);
  mkdirSync(dirname(outAbs), { recursive: true });

  const depth = opts.outRel.replace(/\\/g, "/").split("/").length - 1;
  const rootPrefix = depth > 0 ? "../".repeat(depth) : "./";

  const description =
    opts.concept.description ??
    extractDescription(opts.concept.body) ??
    (opts.isIndex ? opts.config.site.description : undefined);
  const canonicalUrl =
    opts.baseUrl.length > 0 ? `${opts.baseUrl.replace(/\/$/, "")}/${opts.outRel}` : undefined;

  const writeMd = resolveBuildOutputs(opts.config.build.outputs).md_alternate;
  const mdOutRel = writeMd ? opts.outRel.replace(/\.html$/, ".md") : undefined;
  if (writeMd && mdOutRel) {
    writeFileSync(join(opts.outDir, mdOutRel), conceptToOkfMarkdown(opts.concept), "utf8");
  }

  const extraHead = [
    ...(opts.extraHead ?? []),
    ...(opts.fontCss ? [opts.fontCss] : []),
  ];

  const pageLang = opts.lang ?? opts.config.site.lang;
  const emergency = resolveEmergencyBanner(
    opts.config.site,
    opts.localeId ?? "default",
  );
  const siteLicense = resolveSiteLicense(opts.config.site);
  const html = buildPage({
    title: opts.concept.title,
    siteTitle: opts.config.site.title,
    bodyHtml: opts.bodyHtml,
    rootPrefix,
    description,
    canonicalUrl,
    lang: pageLang,
    emergencyBannerHtml: emergency ? emergencyBannerHtml(emergency, pageLang) : undefined,
    hreflangAlternates: opts.hreflangAlternates,
    ogLocaleAlternates: opts.ogLocaleAlternates,
    feedPath: resolveBuildOutputs(opts.config.build.outputs).feed ? "feed.xml" : undefined,
    showArchiveNav: opts.showArchiveNav,
    searchPath: opts.searchPath,
    pageKind: opts.pageKind ?? (opts.isIndex ? "website" : "article"),
    machineSources:
      writeMd && mdOutRel ? [{ href: mdOutRel, type: "text/markdown" }] : undefined,
    extraHead: extraHead.length > 0 ? extraHead : undefined,
    docsLayout: opts.docsLayout,
    docsSidebarHtml: opts.docsSidebarHtml,
    headerSearchHtml: opts.headerSearchHtml,
    ogImageUrl: pageOgImage(opts.concept.frontmatter, opts.config.site.og_image, opts.baseUrl),
    siteLicense,
  });
  writeFileSync(outAbs, html, "utf8");

  return { mdOutRel, canonicalUrl };
}