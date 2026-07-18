import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYaml } from "@sorane/okf";
import { resolveDigitalSourceType } from "@sorane/okf";

export interface AssetAiSystemEntry {
  readonly name: string;
  readonly version?: string;
  readonly provider?: string;
}

export interface AssetProvenanceEntry {
  readonly digitalSourceType?: string;
  readonly aiDisclosureNote?: string;
  readonly createIntent?: string;
  readonly aiSystems?: readonly AssetAiSystemEntry[];
}

export type AssetProvenanceMap = Readonly<Record<string, AssetProvenanceEntry>>;

const DEFAULT_MANIFEST_REL = "asset-provenance.yaml";

function parseAssetAiSystems(raw: unknown): readonly AssetAiSystemEntry[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AssetAiSystemEntry[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (name.length === 0) continue;
    out.push({
      name,
      version: typeof row.version === "string" ? row.version : undefined,
      provider: typeof row.provider === "string" ? row.provider : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

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
    const aiSystems = parseAssetAiSystems(entry.aiSystems);
    out[normalizeAssetKey(key)] = {
      digitalSourceType: dst,
      aiDisclosureNote: note,
      createIntent,
      aiSystems,
    };
  }
  return out;
}

export interface ProvenanceLookupHints {
  readonly staticRel?: string;
  readonly markdownPath?: string;
  readonly publicPath?: string;
  readonly contentRel?: string;
  readonly sourceMdRel?: string;
}

function provenanceCandidates(hints: ProvenanceLookupHints): string[] {
  const out: string[] = [];
  const push = (value: string | undefined) => {
    if (!value) return;
    const key = normalizeAssetKey(value);
    if (key.length > 0 && !out.includes(key)) out.push(key);
  };

  push(hints.staticRel);
  push(hints.markdownPath);
  push(hints.publicPath);
  push(hints.contentRel);
  // External hotlink keys may be stored with or without trailing slash / http vs https
  if (hints.markdownPath?.startsWith("http")) {
    push(hints.markdownPath.replace(/\/$/, ""));
    if (hints.markdownPath.startsWith("https://")) {
      push(`http://${hints.markdownPath.slice("https://".length)}`);
    } else if (hints.markdownPath.startsWith("http://")) {
      push(`https://${hints.markdownPath.slice("http://".length)}`);
    }
  }
  if (hints.staticRel) push(join("static", hints.staticRel).replace(/\\/g, "/"));
  if (hints.publicPath?.startsWith("static/")) {
    push(hints.publicPath.slice("static/".length));
  }
  if (hints.sourceMdRel && hints.markdownPath && !hints.markdownPath.startsWith("http")) {
    const sourceDir = hints.sourceMdRel.includes("/")
      ? hints.sourceMdRel.replace(/\/[^/]+$/, "")
      : "";
    push(sourceDir.length > 0 ? `${sourceDir}/${hints.markdownPath}` : hints.markdownPath);
  }
  return out;
}

export function lookupAssetProvenance(
  map: AssetProvenanceMap,
  hints: string | ProvenanceLookupHints,
): AssetProvenanceEntry | undefined {
  const keys =
    typeof hints === "string"
      ? provenanceCandidates({ staticRel: hints })
      : provenanceCandidates(hints);
  for (const key of keys) {
    const entry = map[key];
    if (entry) return entry;
  }
  return undefined;
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