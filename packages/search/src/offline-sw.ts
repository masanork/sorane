/**
 * Emit a root-scoped service worker that precaches browser search assets
 * (search.mjs + search-index.json + optional search page) for offline FTS.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

export interface WriteSearchServiceWorkerOptions {
  /** Paths relative to site root (no leading slash), e.g. assets/search.mjs */
  readonly precache: readonly string[];
  /** Cache bucket suffix (default: build timestamp or "v1"). */
  readonly version?: string;
}

function normalizePrecachePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\//, "");
}

/** Generate service worker source (scope = site root). */
export function buildSearchServiceWorkerSource(
  opts: WriteSearchServiceWorkerOptions,
): string {
  const version = opts.version ?? "v1";
  const paths = [...new Set(opts.precache.map(normalizePrecachePath))].filter(
    Boolean,
  );
  const cacheName = `sorane-offline-search-${version}`;
  // Paths as site-root relative (no leading ./) for matching.
  return `/* sorane offline search service worker — generated */
const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(paths)};

function toUrl(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((p) =>
            cache.add(toUrl(p)).catch(() => {
              /* optional path missing at install */
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("sorane-offline-search-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPrecached(url) {
  try {
    const u = new URL(url);
    const scope = new URL(self.registration.scope);
    if (u.origin !== scope.origin) return false;
    let rel = u.pathname;
    const base = scope.pathname.replace(/\\/+$/, "") || "";
    if (base && rel.startsWith(base)) {
      rel = rel.slice(base.length);
    }
    rel = rel.replace(/^\\/+/, "");
    return PRECACHE.includes(rel);
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (isPrecached(req.url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            cache.put(req, res.clone());
          }
          return res;
        } catch (err) {
          if (hit) return hit;
          throw err;
        }
      }),
    );
    return;
  }

  // Navigation: network first, fall back to cached search page if listed.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(async () => {
          const cache = await caches.open(CACHE);
          for (const p of PRECACHE) {
            if (p.endsWith(".html") || p === "" || p.endsWith("/")) {
              const page = await cache.match(toUrl(p));
              if (page) return page;
            }
          }
          return Response.error();
        }),
    );
  }
});
`;
}

/** Write `sw.js` at the site output root. */
export function writeSearchServiceWorker(
  outDir: string,
  opts: WriteSearchServiceWorkerOptions,
): string {
  const dest = join(outDir, "sw.js");
  writeFileSync(dest, buildSearchServiceWorkerSource(opts), "utf8");
  return dest;
}
