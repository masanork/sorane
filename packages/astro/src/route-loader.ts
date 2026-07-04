import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { SoraneAstroPermalink } from "./options.ts";
import type { RouteMappingOptions } from "./routes.ts";

const GET_COLLECTION_RE = /getCollection\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export interface AstroDiscoveredCollectionRoute {
  readonly collection: string;
  readonly basePath: string;
  readonly permalink: SoraneAstroPermalink;
}

export interface AstroRoutePlan extends RouteMappingOptions {
  readonly discovered: readonly AstroDiscoveredCollectionRoute[];
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

function walkPages(root: string): string[] {
  const out: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else if (name.endsWith(".astro")) out.push(abs);
    }
  }
  visit(root);
  return out;
}

function parseAstroBuildFormat(root: string): SoraneAstroPermalink {
  for (const name of ["astro.config.mjs", "astro.config.js", "astro.config.ts"]) {
    const abs = join(root, name);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    if (/format\s*:\s*['"]directory['"]/.test(text)) return "directory";
    if (/format\s*:\s*['"]file['"]/.test(text)) return "html";
  }
  return "html";
}

function routeMetaFromPageRel(pageRel: string): {
  basePath: string;
  permalink: SoraneAstroPermalink;
} {
  const withoutExt = pageRel.replace(/\\/g, "/").replace(/\.astro$/i, "");
  const parts = withoutExt.split("/");
  const baseParts: string[] = [];
  let permalink: SoraneAstroPermalink = "html";

  for (const part of parts) {
    if (part === "[...slug]") {
      permalink = "directory";
      break;
    }
    if (part === "[slug]" || /^\[[^.\]]+\]$/.test(part)) {
      break;
    }
    baseParts.push(part);
  }

  if (parts.at(-1) === "index" && parts.some((p) => p === "[slug]" || p === "[...slug]")) {
    permalink = "directory";
  }

  return { basePath: baseParts.join("/"), permalink };
}

function collectionsInPageSource(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(GET_COLLECTION_RE)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return [...names].sort();
}

/** Scan `src/pages` for `getCollection()` usage and infer collection URL bases. */
export function discoverAstroCollectionRoutes(
  root: string,
  pagesDir = "src/pages",
): AstroDiscoveredCollectionRoute[] {
  const pagesRoot = resolve(root, pagesDir);
  if (!existsSync(pagesRoot)) return [];

  const defaultPermalink = parseAstroBuildFormat(root);
  const byCollection = new Map<string, AstroDiscoveredCollectionRoute>();

  for (const abs of walkPages(pagesRoot)) {
    const pageRel = relative(pagesRoot, abs).replace(/\\/g, "/");
    const source = readFileSync(abs, "utf8");
    const collections = collectionsInPageSource(source);
    if (collections.length === 0) continue;

    const { basePath, permalink } = routeMetaFromPageRel(pageRel);
    for (const collection of collections) {
      const existing = byCollection.get(collection);
      const next: AstroDiscoveredCollectionRoute = {
        collection,
        basePath: trimSlashes(basePath),
        permalink: permalink ?? defaultPermalink,
      };
      if (!existing || next.basePath.length > existing.basePath.length) {
        byCollection.set(collection, next);
      }
    }
  }

  return [...byCollection.values()].sort((a, b) => a.collection.localeCompare(b.collection));
}

export function mergeCollectionRouteMap(
  discovered: readonly AstroDiscoveredCollectionRoute[],
  manual?: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const route of discovered) {
    out[route.collection] = route.basePath;
  }
  if (manual) {
    for (const [collection, basePath] of Object.entries(manual)) {
      out[collection] = basePath;
    }
  }
  return out;
}

function inferredPermalink(
  discovered: readonly AstroDiscoveredCollectionRoute[],
  manualPermalink?: SoraneAstroPermalink,
): SoraneAstroPermalink | undefined {
  if (manualPermalink !== undefined) return manualPermalink;
  const formats = new Set(discovered.map((d) => d.permalink));
  if (formats.size === 1) return [...formats][0];
  return undefined;
}

/** Merge discovered Astro routes with manual `collections` / `permalink` overrides. */
export function resolveAstroRoutePlan(
  root: string,
  options?: RouteMappingOptions & { readonly pagesDir?: string },
): AstroRoutePlan {
  const discovered = discoverAstroCollectionRoutes(root, options?.pagesDir);
  return {
    discovered,
    collections: mergeCollectionRouteMap(discovered, options?.collections),
    permalink: inferredPermalink(discovered, options?.permalink),
  };
}