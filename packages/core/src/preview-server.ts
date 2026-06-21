import { createServer, type Server } from "node:http";
import { readFileSync, statSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".gz": "application/gzip",
};

export function resolvePreviewFilePath(rootDir: string, urlPath: string): string | null {
  const root = resolve(rootDir);
  let pathname = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.endsWith("/")) pathname += "index.html";
  const candidate = resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}/`)) return null;
  return candidate;
}

export function startPreviewServer(
  rootDir: string,
  port: number,
  onListen?: (url: string) => void,
  host = "127.0.0.1",
): Server {
  const root = resolve(rootDir);
  const server = createServer((req, res) => {
    const filePath = resolvePreviewFilePath(root, req.url ?? "/");
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    let target = filePath;
    if (!existsSync(target) || statSync(target).isDirectory()) {
      const index = join(target, "index.html");
      if (existsSync(index)) target = index;
      else {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
    }
    const ext = extname(target).toLowerCase();
    const type = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(readFileSync(target));
  });
  server.listen(port, host, () => {
    onListen?.(`http://${host}:${port}/`);
  });
  return server;
}