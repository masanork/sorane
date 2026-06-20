import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { extractCharset } from "./extract-charset.ts";
import { buildFontFaceCss, buildFontStackCss } from "./font-face.ts";
import { subsetWoff2 } from "./wasm-subsetter.ts";

export interface FontSourceSpec {
  readonly source: string;
  readonly weight?: string;
  /** subset（既定）または dist へそのままコピーする static */
  readonly embed?: "subset" | "static";
}

export interface FontRoles {
  readonly body: readonly string[];
  readonly heading?: readonly string[];
  readonly code?: readonly string[];
}

export interface FontConfig {
  readonly enabled: boolean;
  readonly cache_dir: string;
  readonly skip_key: string;
  /** 単一フォント（後方互換） */
  readonly family?: string;
  readonly source?: string;
  readonly weight?: string;
  /** 複数フォントスタック */
  readonly roles?: FontRoles;
  readonly sources?: Readonly<Record<string, FontSourceSpec>>;
}

export interface FontProcessor {
  fontCssForPage(opts: {
    body: string;
    title: string;
    /** レンダリング済み HTML 由来の追加文字（index 等） */
    extraText?: string;
    frontmatter: Record<string, unknown>;
    rootPrefix: string;
  }): Promise<string | undefined>;
}

interface LoadedFont {
  readonly family: string;
  readonly bytes: Uint8Array;
  readonly weight: string;
  readonly embed: "subset" | "static";
  readonly sourcePath: string;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function familySlug(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function collectFamilies(config: FontConfig): readonly string[] {
  if (!config.roles) return [];
  const out = new Set<string>();
  for (const list of [config.roles.body, config.roles.heading, config.roles.code]) {
    if (list) for (const family of list) out.add(family);
  }
  return [...out];
}

function loadFonts(cwd: string, config: FontConfig): LoadedFont[] | null {
  if (config.sources && config.roles) {
    const families = collectFamilies(config);
    const loaded: LoadedFont[] = [];
    for (const family of families) {
      const spec = config.sources[family];
      if (!spec) {
        process.stderr.write(`[sorane] font source spec missing for family: ${family}\n`);
        continue;
      }
      const sourcePath = resolve(cwd, spec.source);
      if (!existsSync(sourcePath)) {
        process.stderr.write(`[sorane] font source not found: ${sourcePath} (skipping ${family})\n`);
        continue;
      }
      loaded.push({
        family,
        bytes: new Uint8Array(readFileSync(sourcePath)),
        weight: spec.weight ?? "400",
        embed: spec.embed ?? "subset",
        sourcePath,
      });
    }
    return loaded.length > 0 ? loaded : null;
  }

  if (!config.family || !config.source) return null;
  const sourcePath = resolve(cwd, config.source);
  if (!existsSync(sourcePath)) {
    process.stderr.write(`[sorane] font source not found: ${sourcePath} (skipping subset)\n`);
    return null;
  }
  return [{
    family: config.family,
    bytes: new Uint8Array(readFileSync(sourcePath)),
    weight: config.weight ?? "450",
    embed: "subset",
    sourcePath,
  }];
}

export async function createFontProcessor(
  cwd: string,
  config: FontConfig,
  outDir: string,
): Promise<FontProcessor | null> {
  if (!config.enabled) return null;

  const fonts = loadFonts(cwd, config);
  if (!fonts || fonts.length === 0) return null;

  const stackMode = Boolean(config.sources && config.roles);
  const cacheDir = resolve(cwd, config.cache_dir);
  const distFontDir = join(outDir, "assets", "fonts");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(distFontDir, { recursive: true });

  const subsetFonts = fonts.filter((f) => f.embed === "subset");
  if (subsetFonts.length > 0) {
    try {
      await subsetWoff2(subsetFonts[0]!.bytes, "Aa"); // warm WASM
    } catch {
      // ウォームアップ失敗は本番サブセット処理に委ねる
    }
  }

  const written = new Map<string, string>();
  const staticFaces: Array<{ family: string; url: string; weight: string; format: "woff2" | "truetype" | "opentype" }> = [];

  for (const font of fonts) {
    if (font.embed !== "static") continue;
    const distName = basename(font.sourcePath);
    const distPath = join(distFontDir, distName);
    if (!existsSync(distPath)) {
      copyFileSync(font.sourcePath, distPath);
    }
    const ext = distName.split(".").pop()?.toLowerCase();
    const format = ext === "otf" ? "opentype" : "truetype";
    staticFaces.push({
      family: font.family,
      url: `assets/fonts/${distName}`,
      weight: font.weight,
      format,
    });
  }

  return {
    async fontCssForPage(opts) {
      if (opts.frontmatter[config.skip_key] === true) {
        return undefined;
      }

      const text = extractCharset(opts.body, opts.title, undefined, opts.extraText ?? "");
      const key = textHash(text);
      const faces: Array<{ family: string; url: string; weight: string; format?: "woff2" | "truetype" | "opentype" }> = [
        ...staticFaces.map((f) => ({
          ...f,
          url: `${opts.rootPrefix}${f.url}`,
        })),
      ];

      for (const font of fonts) {
        if (font.embed === "static") continue;

        const cacheKey = `${familySlug(font.family)}:${key}`;
        let distName = written.get(cacheKey);

        if (!distName) {
          const cachePath = join(cacheDir, `${familySlug(font.family)}-${key}.woff2`);
          let woff2: Uint8Array;
          if (existsSync(cachePath)) {
            woff2 = new Uint8Array(readFileSync(cachePath));
          } else {
            try {
              woff2 = await subsetWoff2(font.bytes, text);
            } catch {
              // Ext/PUP などページ内に該当グリフが無い書体はスキップ
              continue;
            }
            writeFileSync(cachePath, woff2);
          }
          const hash = sha256Hex(woff2).slice(0, 12);
          distName = `${familySlug(font.family)}-${hash}.woff2`;
          const distPath = join(distFontDir, distName);
          if (!existsSync(distPath)) {
            writeFileSync(distPath, woff2);
          }
          written.set(cacheKey, distName);
        }

        faces.push({
          family: font.family,
          url: `${opts.rootPrefix}assets/fonts/${distName}`,
          weight: font.weight,
          format: "woff2",
        });
      }

      if (stackMode) {
        return buildFontStackCss(faces);
      }

      const primary = faces[0]!;
      return buildFontFaceCss(primary.family, primary.url, primary.weight);
    },
  };
}