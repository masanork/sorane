import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function copySearchScript(outRoot: string, repoRoot?: string): boolean {
  const root = repoRoot ?? packageRoot();
  const src = join(root, "packages/search/assets/search.mjs");
  if (!existsSync(src)) return false;
  const webmcp = join(root, "packages/search/assets/webmcp.mjs");
  if (!existsSync(webmcp)) return false;
  const destDir = join(outRoot, "assets");
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, "search.mjs"));
  copyFileSync(webmcp, join(destDir, "webmcp.mjs"));
  return true;
}

export function readSearchScript(repoRoot?: string): string {
  const root = repoRoot ?? packageRoot();
  return readFileSync(join(root, "packages/search/assets/search.mjs"), "utf8");
}
