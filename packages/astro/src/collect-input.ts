import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
  type SoraneAstroBackendFileInput,
  type SoraneAstroBackendInput,
} from "./contract.ts";
import type { SoraneAstroOptions } from "./options.ts";
import { resolveAstroRoutePlan, type AstroRoutePlan } from "./route-loader.ts";

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

export function collectSoraneAstroBackendFiles(contentDir: string): SoraneAstroBackendFileInput[] {
  return walkContent(contentDir).map((abs) => {
    const rel = relative(contentDir, abs).replace(/\\/g, "/");
    return { relPath: rel, source: readFileSync(abs, "utf8") };
  });
}

export function buildSoraneAstroBackendInput(
  options: SoraneAstroOptions,
  paths: { root: string; contentDir: string; outDir: string },
  files: readonly SoraneAstroBackendFileInput[],
  routePlan?: AstroRoutePlan,
): SoraneAstroBackendInput {
  const routes =
    routePlan ??
    resolveAstroRoutePlan(paths.root, {
      collections: options.collections,
      permalink: options.permalink,
    });
  return {
    schema_version: SORANE_ASTRO_BACKEND_SCHEMA_VERSION,
    root: paths.root,
    contentDir: paths.contentDir,
    outDir: paths.outDir,
    site: {
      title: options.site.title,
      description: options.site.description,
      baseUrl: options.site.baseUrl,
    },
    files,
    permalink: routes.permalink ?? options.permalink,
    collections: routes.collections,
    outputs: {
      catalog: options.outputs?.catalog,
      llmsTxt: options.outputs?.llmsTxt,
      okfBundle: options.outputs?.okfBundle,
      sitemap: options.outputs?.sitemap,
      dcatCatalog:
        options.outputs?.dcatCatalog ?? options.openData?.dcatCatalog ?? false,
    },
    validate: options.validate,
    quality: options.quality,
    okf: options.okf,
    openData: options.openData,
  };
}

export function resolveAstroPaths(options: SoraneAstroOptions): {
  root: string;
  contentDir: string;
  outDir: string;
} {
  const root = resolve(options.root ?? process.cwd());
  return {
    root,
    contentDir: resolve(root, options.contentDir ?? "src/content"),
    outDir: resolve(root, options.outDir ?? "dist"),
  };
}

export function contentDirExists(contentDir: string): boolean {
  return existsSync(contentDir);
}