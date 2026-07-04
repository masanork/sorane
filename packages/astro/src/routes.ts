import type { SoraneAstroPermalink } from "./options.ts";

export interface RouteMappingOptions {
  readonly permalink?: SoraneAstroPermalink;
  readonly collections?: Readonly<Record<string, string>>;
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

export function htmlRelForContent(relPath: string, opts: RouteMappingOptions): string {
  const normalized = relPath.replace(/\\/g, "/");
  const withoutExt = normalized.replace(/\.(md|mdx)$/i, "");
  const parts = withoutExt.split("/");
  const collection = parts[0] ?? "";
  const entryTail = parts.slice(1).join("/");
  const routeBase = opts.collections?.[collection];
  const routeParts =
    routeBase === undefined
      ? parts
      : [trimSlashes(routeBase), ...(entryTail.length > 0 ? [entryTail] : [])];
  const cleanParts = routeParts.filter((p) => p.length > 0);
  const route = cleanParts.join("/");
  if (route === "" || route === "index") return "index.html";
  if (route.endsWith("/index")) return `${route.slice(0, -"index".length)}index.html`;
  if (opts.permalink === "directory") return `${route}/index.html`;
  return `${route}.html`;
}

export function absoluteUrl(baseUrl: string, rel: string): string {
  if (baseUrl.length === 0) return rel;
  return `${baseUrl.replace(/\/$/, "")}/${rel.replace(/^\//, "")}`;
}