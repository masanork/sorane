import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { extractCharset } from "./extract-charset.ts";
import { buildFontFaceCss } from "./font-face.ts";
import { subsetWoff2 } from "./wasm-subsetter.ts";

export interface FontConfig {
  readonly enabled: boolean;
  readonly family: string;
  readonly source: string;
  readonly cache_dir: string;
  readonly weight: string;
  readonly skip_key: string;
}

export interface FontProcessor {
  fontCssForPage(opts: {
    body: string;
    title: string;
    frontmatter: Record<string, unknown>;
    rootPrefix: string;
  }): Promise<string | undefined>;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

export async function createFontProcessor(
  cwd: string,
  config: FontConfig,
  outDir: string,
): Promise<FontProcessor | null> {
  if (!config.enabled) return null;

  const sourcePath = resolve(cwd, config.source);
  if (!existsSync(sourcePath)) {
    process.stderr.write(`[sorane] font source not found: ${sourcePath} (skipping subset)\n`);
    return null;
  }

  const fontBytes = new Uint8Array(readFileSync(sourcePath));
  const cacheDir = resolve(cwd, config.cache_dir);
  const distFontDir = join(outDir, "assets", "fonts");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(distFontDir, { recursive: true });

  await subsetWoff2(fontBytes, "あ"); // warm WASM

  const written = new Map<string, string>();

  return {
    async fontCssForPage(opts) {
      if (opts.frontmatter[config.skip_key] === true) {
        return undefined;
      }

      const text = extractCharset(opts.body, opts.title);
      const key = textHash(text);
      let distName = written.get(key);

      if (!distName) {
        const cachePath = join(cacheDir, `${key}.woff2`);
        let woff2: Uint8Array;
        if (existsSync(cachePath)) {
          woff2 = new Uint8Array(readFileSync(cachePath));
        } else {
          woff2 = await subsetWoff2(fontBytes, text);
          writeFileSync(cachePath, woff2);
        }
        const hash = sha256Hex(woff2).slice(0, 12);
        distName = `${hash}.woff2`;
        const distPath = join(distFontDir, distName);
        if (!existsSync(distPath)) {
          writeFileSync(distPath, woff2);
        }
        written.set(key, distName);
      }

      const url = `${opts.rootPrefix}assets/fonts/${distName}`;
      return buildFontFaceCss(config.family, url, config.weight);
    },
  };
}