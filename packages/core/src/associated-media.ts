import { resolveDigitalSourceType } from "@sorane/okf";
import {
  lookupAssetProvenance,
  type AssetProvenanceEntry,
  type AssetProvenanceMap,
} from "./asset-provenance.ts";
import { hasImageMetadataFields } from "./iptc-xmp-pass.ts";
import type { ExternalMarkdownImageRef } from "./markdown-external-images.ts";
import type { MarkdownImageRef } from "./markdown-image-refs.ts";

export interface AssociatedMediaItem {
  readonly contentUrl: string;
  readonly digitalSourceType: string;
  readonly name?: string;
  readonly encodingFormat?: string;
}

function encodingFormatFromPath(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return undefined;
}

function encodingFormatFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    return encodingFormatFromPath(path);
  } catch {
    return undefined;
  }
}

function provenanceForRef(
  map: AssetProvenanceMap,
  ref: MarkdownImageRef,
): AssetProvenanceEntry | undefined {
  return lookupAssetProvenance(map, {
    staticRel: ref.kind === "static" ? ref.publicPath.replace(/^static\//, "") : undefined,
    markdownPath: ref.markdownPath,
    publicPath: ref.publicPath,
    contentRel: ref.publicPath,
    sourceMdRel: ref.sourceMdRel,
  });
}

function provenanceForExternal(
  map: AssetProvenanceMap,
  ref: ExternalMarkdownImageRef,
): AssetProvenanceEntry | undefined {
  return (
    lookupAssetProvenance(map, { markdownPath: ref.url, publicPath: ref.url }) ??
    map[ref.url]
  );
}

function toAssociatedMediaItem(
  ref: MarkdownImageRef,
  entry: AssetProvenanceEntry,
  baseUrl: string,
): AssociatedMediaItem | null {
  const dst = entry.digitalSourceType;
  if (!dst) return null;
  const resolved = resolveDigitalSourceType(dst);
  if (!resolved) return null;

  const path = ref.publicPath.startsWith("/") ? ref.publicPath : `/${ref.publicPath}`;
  const contentUrl =
    baseUrl.length > 0 ? `${baseUrl.replace(/\/$/, "")}${path}` : path.replace(/^\//, "");

  return {
    contentUrl,
    digitalSourceType: resolved.uri,
    ...(ref.alt.length > 0 ? { name: ref.alt } : {}),
    encodingFormat: encodingFormatFromPath(ref.publicPath),
  };
}

function toExternalAssociatedMediaItem(
  ref: ExternalMarkdownImageRef,
  entry: AssetProvenanceEntry,
): AssociatedMediaItem | null {
  const dst = entry.digitalSourceType;
  if (!dst) return null;
  const resolved = resolveDigitalSourceType(dst);
  if (!resolved) return null;
  return {
    contentUrl: ref.url,
    digitalSourceType: resolved.uri,
    ...(ref.alt.length > 0 ? { name: ref.alt } : {}),
    encodingFormat: encodingFormatFromUrl(ref.url),
  };
}

/** 記事本文のインライン画像から `associatedMedia` 用 ImageObject 配列を組み立てる。 */
export function buildAssociatedMediaForArticle(opts: {
  readonly refs: readonly MarkdownImageRef[];
  /** External hotlinks (`![](https://…)`) keyed in asset-provenance.yaml by full URL. */
  readonly externalRefs?: readonly ExternalMarkdownImageRef[];
  readonly provenance: AssetProvenanceMap;
  readonly baseUrl: string;
}): AssociatedMediaItem[] {
  const out: AssociatedMediaItem[] = [];
  const seen = new Set<string>();

  for (const ref of opts.refs) {
    const entry = provenanceForRef(opts.provenance, ref);
    if (!hasImageMetadataFields(entry)) continue;
    const item = toAssociatedMediaItem(ref, entry!, opts.baseUrl);
    if (!item || seen.has(item.contentUrl)) continue;
    seen.add(item.contentUrl);
    out.push(item);
  }

  for (const ref of opts.externalRefs ?? []) {
    const entry = provenanceForExternal(opts.provenance, ref);
    if (!hasImageMetadataFields(entry)) continue;
    const item = toExternalAssociatedMediaItem(ref, entry!);
    if (!item || seen.has(item.contentUrl)) continue;
    seen.add(item.contentUrl);
    out.push(item);
  }
  return out;
}

export function associatedMediaJsonLdFields(
  items: readonly AssociatedMediaItem[],
): Record<string, unknown> | null {
  if (items.length === 0) return null;
  return {
    associatedMedia: items.map((item) => ({
      "@type": "ImageObject",
      contentUrl: item.contentUrl,
      digitalSourceType: item.digitalSourceType,
      ...(item.name ? { name: item.name } : {}),
      ...(item.encodingFormat ? { encodingFormat: item.encodingFormat } : {}),
    })),
  };
}