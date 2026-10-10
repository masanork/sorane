import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildE2eFixture } from "./e2e-fixture.mjs";
import { contactE2e } from "./e2e-contact-fixture.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
};

const root = mkdtempSync(join(tmpdir(), "sorane-e2e-"));
const outDir = join(root, "dist");

await buildE2eFixture(root, outDir);
await buildE2eFixture(join(root, "disabled-site"), join(outDir, "disabled"), { webmcp: false });
await buildE2eFixture(join(root, "subsite"), join(outDir, "subsite"), { snippetOnly: true });
await buildE2eFixture(join(root, "extended-site"), join(outDir, "extended"), { snippetOnly: true, extended: true });
await buildE2eFixture(join(root, "native-site"), join(outDir, "native"), {
  nativeContact:true, baseUrl:"https://public.sorane.example/native/",
});
await buildE2eFixture(join(root, "pages-site"), join(outDir, "pages"), {
  nativeContact:true, baseUrl:"https://public.sorane.example/",
});
const port = Number(process.env.E2E_PORT ?? 4173);
const contact = await contactE2e(join(outDir,"native"),port);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  try {if(await contact.handle(req,res,url)) return;} catch {res.writeHead(500);res.end('test fixture failed');return;}
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  if (rel === "/") rel = "/index.html";
  const filePath = join(outDir, rel.replace(/^\//, ""));
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(readFileSync(filePath));
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`[e2e] serving ${outDir} on http://127.0.0.1:${port}\n`);
});

const cleanup = async () => {
  server.close();
  await contact.close();
  rmSync(root, { recursive: true, force: true });
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
