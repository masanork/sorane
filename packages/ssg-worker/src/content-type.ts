export function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return ({html:"text/html; charset=utf-8",css:"text/css; charset=utf-8",js:"text/javascript; charset=utf-8",
    mjs:"text/javascript; charset=utf-8",json:"application/json; charset=utf-8",jsonld:"application/ld+json; charset=utf-8",
    xml:"application/xml; charset=utf-8",txt:"text/plain; charset=utf-8",md:"text/markdown; charset=utf-8",
    svg:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",ico:"image/x-icon",
    woff2:"font/woff2",pdf:"application/pdf"} as Record<string,string>)[ext] ?? "application/octet-stream";
}
