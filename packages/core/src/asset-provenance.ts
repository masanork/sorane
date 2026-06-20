import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYaml } from "@sorane/okf";
import { resolveDigitalSourceType } from "@sorane/okf";

export interface AssetProvenanceEntry {
  readonly digitalSourceType?: string;
  readonly aiDisclosureNote?: string;
  readonly createIntent?: string;
}

export type AssetProvenanceMap = Readonly<Record<string, AssetProvenanceEntry>>;

const DEFAULT_MANIFEST_REL = "asset-provenance.yaml";

function normalizeAssetKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** `content/asset-provenance.yaml` を読み込む（無ければ空）。 */
export function loadAssetProvenance(
  contentDir: string,
  manifestRel = DEFAULT_MANIFEST_REL,
): AssetProvenanceMap {
  const path = resolve(contentDir, manifestRel);
  if (!existsSync(path)) return {};
  const raw = parseYaml(readFileSync(path, "utf8"));
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const assets = (raw as Record<string, unknown>).assets;
  if (assets === null || typeof assets !== "object" || Array.isArray(assets)) return {};

  const out: Record<string, AssetProvenanceEntry> = {};
  for (const [key, value] of Object.entries(assets as Record<string, unknown>)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const dst =
      typeof entry.digitalSourceType === "string" ? entry.digitalSourceType : undefined;
    const note =
      typeof entry.aiDisclosureNote === "string" ? entry.aiDisclosureNote : undefined;
    const createIntent =
      typeof entry.createIntent === "string" ? entry.createIntent : undefined;
    out[normalizeAssetKey(key)] = {
      digitalSourceType: dst,
      aiDisclosureNote: note,
      createIntent,
    };
  }
  return out;
}

export function lookupAssetProvenance(
  map: AssetProvenanceMap,
  staticRelPath: string,
): AssetProvenanceEntry | undefined {
  const key = normalizeAssetKey(staticRelPath);
  return map[key] ?? map[join("static", key).replace(/\\/g, "/")];
}

/** C2PA `--create` に渡す IPTC 短コードを解決する。 */
export function resolveC2paCreateIntent(
  entry: AssetProvenanceEntry | undefined,
  fallback = "digitalCapture",
): string {
  if (entry?.createIntent) return entry.createIntent;
  const dst = entry?.digitalSourceType;
  if (!dst) return fallback;
  const resolved = resolveDigitalSourceType(dst);
  if (!resolved) return fallback;
  const code = resolved.code;
  if (code === "trainedAlgorithmicMedia" || code === "compositeWithTrainedAlgorithmicMedia") {
    return code;
  }
  if (code === "digitalCreation" || code === "humanEdits") return "digitalCapture";
  return fallback;
}