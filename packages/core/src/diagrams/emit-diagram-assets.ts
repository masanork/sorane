import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { DiagramsConfig } from "../config.ts";
import { resolveThemeAssetDir } from "../theme-assets.ts";
import { resolveMermaidMode } from "./diagram-meta.ts";

const require = createRequire(import.meta.url);

export interface EmitDiagramAssetsOptions {
  readonly cwd: string;
  readonly outDir: string;
  readonly config: DiagramsConfig;
  readonly contentHasMermaid?: boolean;
  readonly onProgress?: (message: string) => void;
}

export interface EmitDiagramAssetsResult {
  readonly copied: boolean;
  readonly bytes: number;
  readonly version?: string;
}

export function substituteMermaidVersion(source: string, version: string): string {
  return source.replace(/\{\{\s*MERMAID_VERSION\s*\}\}/g, version);
}

function resolveMermaidPackageRoot(): string | null {
  try {
    const pkgPath = require.resolve("mermaid/package.json");
    return dirname(pkgPath);
  } catch {
    return null;
  }
}

function listMermaidDistFiles(distDir: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) {
        visit(p);
        continue;
      }
      if (entry.endsWith(".map") || entry.endsWith(".d.ts")) continue;
      if (entry.endsWith(".mjs") || entry.endsWith(".js")) out.push(p);
    }
  };
  visit(distDir);
  return out;
}

export function emitDiagramAssets(opts: EmitDiagramAssetsOptions): EmitDiagramAssetsResult {
  const log = opts.onProgress ?? (() => {});
  const config = opts.config;

  if (config.enabled === false) {
    return { copied: false, bytes: 0 };
  }
  if (resolveMermaidMode(config) === "off") {
    return { copied: false, bytes: 0 };
  }
  if (opts.contentHasMermaid === false) {
    log("diagrams: no mermaid fences; skipping asset copy");
    return { copied: false, bytes: 0 };
  }

  const mermaidRoot = resolveMermaidPackageRoot();
  if (!mermaidRoot) {
    log("diagrams: mermaid package not found; skipping asset copy");
    return { copied: false, bytes: 0 };
  }

  const version = JSON.parse(
    readFileSync(join(mermaidRoot, "package.json"), "utf8"),
  ).version as string;
  const distDir = join(mermaidRoot, "dist");
  if (!existsSync(distDir)) {
    log(`diagrams: mermaid dist not found at ${distDir}`);
    return { copied: false, bytes: 0 };
  }

  const assetsOut = join(opts.outDir, "assets", "diagrams");
  const mermaidOut = join(assetsOut, `mermaid-${version}`);
  mkdirSync(mermaidOut, { recursive: true });

  let bytes = 0;
  for (const src of listMermaidDistFiles(distDir)) {
    const rel = relative(distDir, src);
    const dest = join(mermaidOut, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    bytes += statSync(dest).size;
  }

  const loaderTemplate =
    resolveThemeAssetDir(opts.cwd, "diagrams") ??
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../templates/default/assets/diagrams",
    );
  const loaderSrc = join(loaderTemplate, "sorane-mermaid-loader.mjs");
  if (existsSync(loaderSrc)) {
    const loaderBody = substituteMermaidVersion(
      readFileSync(loaderSrc, "utf8"),
      version,
    );
    writeFileSync(join(assetsOut, "sorane-mermaid-loader.mjs"), loaderBody, "utf8");
    bytes += Buffer.byteLength(loaderBody, "utf8");
  }

  log(`diagrams: copied mermaid ${version} (${(bytes / 1024).toFixed(1)} KB)`);
  return { copied: true, bytes, version };
}

const MERMAID_FENCE_RE = /```mermaid\b/m;

export function contentHasMermaidFences(mdFiles: readonly string[]): boolean {
  for (const abs of mdFiles) {
    const text = readFileSync(abs, "utf8");
    if (MERMAID_FENCE_RE.test(text)) return true;
  }
  return false;
}