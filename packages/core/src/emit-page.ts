import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ParsedConcept } from "@sorane/okf";
import { conceptToOkfMarkdown } from "@sorane/okf";
import { buildPage } from "./ssg.ts";
import type { SoraneConfig } from "./config.ts";
import { extractDescription } from "./ssg.ts";

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
}

export function emitPage(opts: EmitPageOptions): { mdOutRel: string; canonicalUrl?: string } {
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

  const mdOutRel = opts.outRel.replace(/\.html$/, ".md");
  writeFileSync(join(opts.outDir, mdOutRel), conceptToOkfMarkdown(opts.concept), "utf8");

  const extraHead = [
    ...(opts.extraHead ?? []),
    ...(opts.fontCss ? [opts.fontCss] : []),
  ];

  const html = buildPage({
    title: opts.concept.title,
    siteTitle: opts.config.site.title,
    bodyHtml: opts.bodyHtml,
    rootPrefix,
    description,
    canonicalUrl,
    lang: opts.config.site.lang,
    feedPath: "feed.xml",
    showArchiveNav: opts.showArchiveNav,
    searchPath: opts.searchPath,
    pageKind: opts.pageKind ?? (opts.isIndex ? "website" : "article"),
    machineSources: [{ href: mdOutRel, type: "text/markdown" }],
    extraHead: extraHead.length > 0 ? extraHead : undefined,
  });
  writeFileSync(outAbs, html, "utf8");

  return { mdOutRel, canonicalUrl };
}