import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  loadAssetProvenance,
  lookupAssetProvenance,
  resolveC2paCreateIntent,
} from "./asset-provenance.ts";
import {
  c2patoolAvailable,
  isC2paRasterPath,
  resolveC2paCredentials,
  signRasterWithC2pa,
  type C2paCredentials,
} from "./c2pa-pass.ts";
import {
  embedIptcXmp,
  exiftoolAvailable,
  hasImageMetadataFields,
  isImageMetadataPath,
} from "./iptc-xmp-pass.ts";
import type { MarkdownImageRef } from "./markdown-image-refs.ts";
import type { C2paConfig, ImageMetadataConfig } from "./config.ts";

export interface StaticAssetPassOptions {
  readonly cwd: string;
  readonly staticSrc: string;
  readonly outDir: string;
  readonly staticDirName: string;
  readonly contentDir: string;
  readonly c2pa?: C2paConfig;
  readonly imageMetadata?: ImageMetadataConfig;
  readonly skipC2pa?: boolean;
  readonly inlineImages?: readonly MarkdownImageRef[];
  readonly onWarning?: (message: string) => void;
  readonly onProgress?: (message: string) => void;
}

export interface StaticAssetPassResult {
  readonly rasterSigned: number;
  readonly rasterCopied: number;
  readonly metadataEmbedded: number;
  readonly inlineImagesCopied: number;
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else out.push(abs);
    }
  }
  visit(root);
  return out;
}

export async function processStaticAssets(
  opts: StaticAssetPassOptions,
): Promise<StaticAssetPassResult> {
  const warn = opts.onWarning ?? (() => {});
  const log = opts.onProgress ?? (() => {});

  const outRoot = join(opts.outDir, opts.staticDirName);
  if (existsSync(opts.staticSrc)) {
    cpSync(opts.staticSrc, outRoot, { recursive: true });
  }

  const provenance = loadAssetProvenance(
    opts.contentDir,
    opts.imageMetadata?.manifest,
  );

  const imageMetadataConfig = opts.imageMetadata;
  const imageMetadataEnabled = imageMetadataConfig?.enabled === true;
  const exiftoolBinary = imageMetadataConfig?.exiftool ?? "exiftool";
  let exiftoolReady = false;
  if (imageMetadataEnabled) {
    if (exiftoolAvailable(exiftoolBinary)) {
      exiftoolReady = true;
    } else {
      warn(
        `image_metadata.enabled but ${exiftoolBinary} not found on PATH; static images copied without XMP`,
      );
    }
  }

  const c2paConfig = opts.c2pa;
  const skipC2pa = opts.skipC2pa === true;
  let credentials: C2paCredentials | null = null;
  let c2paBinary = c2paConfig?.binary ?? "c2patool";

  if (c2paConfig?.enabled === true && !skipC2pa) {
    credentials = resolveC2paCredentials(c2paConfig);
    if (!credentials) {
      warn(
        "c2pa.enabled but signing credentials missing (set certificate_path/private_key_path or SORANE_C2PA_CERT/SORANE_C2PA_KEY); static images copied unsigned",
      );
    } else if (!c2patoolAvailable(c2paBinary)) {
      warn(`c2pa.enabled but ${c2paBinary} not found on PATH; static images copied unsigned`);
      credentials = null;
    }
  }

  let rasterSigned = 0;
  let rasterCopied = 0;
  let metadataEmbedded = 0;
  let inlineImagesCopied = 0;

  async function tagRaster(outAbs: string, hints: Parameters<typeof lookupAssetProvenance>[1]) {
    const entry = lookupAssetProvenance(provenance, hints);
    const relForLog =
      typeof hints === "string"
        ? hints
        : (hints.publicPath ?? hints.staticRel ?? hints.markdownPath ?? "image");

    if (exiftoolReady && isImageMetadataPath(outAbs) && hasImageMetadataFields(entry)) {
      const embedded = embedIptcXmp(outAbs, entry!, { binary: exiftoolBinary });
      if (embedded.ok) {
        metadataEmbedded += 1;
        log(`iptc-xmp: embedded metadata in ${relForLog}`);
      } else {
        warn(`iptc-xmp: failed to embed ${relForLog}: ${embedded.message ?? "unknown error"}`);
      }
    }

    const relPath = typeof hints === "string" ? hints : hints.staticRel;
    if (!relPath || !isC2paRasterPath(relPath)) return;
    rasterCopied += 1;
    if (!credentials) return;

    const createIntent = resolveC2paCreateIntent(entry);
    const signed = signRasterWithC2pa(
      existsSync(outAbs) ? outAbs : join(opts.staticSrc, relPath),
      outAbs,
      {
        binary: c2paBinary,
        embed: c2paConfig?.embed !== false,
        createIntent,
        credentials,
      },
    );
    if (signed.ok) {
      rasterSigned += 1;
      log(`c2pa: signed ${relForLog} (${createIntent})`);
    } else {
      warn(`c2pa: failed to sign ${relForLog}: ${signed.message ?? "unknown error"}`);
    }
  }

  for (const ref of opts.inlineImages ?? []) {
    if (ref.kind !== "content") continue;
    const outAbs = join(opts.outDir, ref.outRel);
    mkdirSync(dirname(outAbs), { recursive: true });
    copyFileSync(ref.srcAbs, outAbs);
    inlineImagesCopied += 1;
    await tagRaster(outAbs, {
      staticRel: ref.outRel,
      markdownPath: ref.markdownPath,
      publicPath: ref.publicPath,
      contentRel: ref.publicPath,
      sourceMdRel: ref.sourceMdRel,
    });
  }

  if (!existsSync(opts.staticSrc)) {
    if (metadataEmbedded > 0) log(`iptc-xmp: ${metadataEmbedded} image(s) tagged`);
    if (rasterSigned > 0) log(`c2pa: ${rasterSigned} raster asset(s) signed`);
    return { rasterSigned, rasterCopied, metadataEmbedded, inlineImagesCopied };
  }

  const inlineHintsBySrc = new Map<string, MarkdownImageRef>();
  for (const ref of opts.inlineImages ?? []) {
    if (!inlineHintsBySrc.has(ref.srcAbs)) inlineHintsBySrc.set(ref.srcAbs, ref);
  }

  for (const abs of walkFiles(opts.staticSrc)) {
    const rel = relative(opts.staticSrc, abs).replace(/\\/g, "/");
    const outPath = join(outRoot, rel);
    const inline = inlineHintsBySrc.get(abs);
    await tagRaster(outPath, {
      staticRel: rel,
      publicPath: `${opts.staticDirName}/${rel}`,
      markdownPath: inline?.markdownPath,
      sourceMdRel: inline?.sourceMdRel,
      contentRel: inline?.publicPath,
    });
  }

  if (metadataEmbedded > 0) {
    log(`iptc-xmp: ${metadataEmbedded} image(s) tagged`);
  }
  if (rasterSigned > 0) {
    log(`c2pa: ${rasterSigned} raster asset(s) signed`);
  }

  return { rasterSigned, rasterCopied, metadataEmbedded, inlineImagesCopied };
}