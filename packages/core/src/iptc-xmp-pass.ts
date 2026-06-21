import { spawnSync } from "node:child_process";
import { resolveDigitalSourceType } from "@sorane/okf";
import type { AssetProvenanceEntry } from "./asset-provenance.ts";

const IMAGE_METADATA_RE = /\.(jpe?g|png|webp)$/i;

export function isImageMetadataPath(filePath: string): boolean {
  return IMAGE_METADATA_RE.test(filePath);
}

export function hasImageMetadataFields(entry: AssetProvenanceEntry | undefined): boolean {
  if (!entry) return false;
  return Boolean(
    entry.digitalSourceType ||
      entry.aiDisclosureNote ||
      (entry.aiSystems && entry.aiSystems.length > 0),
  );
}

/** ExifTool 引数を組み立てる（in-place 書き込み用）。 */
export function buildIptcXmpExiftoolArgs(entry: AssetProvenanceEntry): string[] {
  const args: string[] = ["-overwrite_original"];

  if (entry.digitalSourceType) {
    const resolved = resolveDigitalSourceType(entry.digitalSourceType);
    if (resolved) {
      args.push(`-XMP-iptcExt:DigitalSourceType=${resolved.uri}`);
    }
  }

  if (entry.aiDisclosureNote) {
    args.push(`-XMP-iptcExt:AIPromptInformation=${entry.aiDisclosureNote}`);
  }

  if (entry.aiSystems && entry.aiSystems.length > 0) {
    const first = entry.aiSystems[0]!;
    const label = first.provider ? `${first.name} (${first.provider})` : first.name;
    args.push(`-XMP-iptcExt:AISystemUsed=${label}`);
    if (first.version) {
      args.push(`-XMP-iptcExt:AISystemVersionUsed=${first.version}`);
    }
  }

  return args;
}

/** ExifTool で IPTC Extension XMP を画像に埋め込む。 */
export function embedIptcXmp(
  filePath: string,
  entry: AssetProvenanceEntry,
  opts: { readonly binary?: string } = {},
): { readonly ok: boolean; readonly message?: string } {
  const args = buildIptcXmpExiftoolArgs(entry);
  if (args.length <= 1) {
    return { ok: false, message: "no IPTC XMP fields to write" };
  }

  const binary = opts.binary ?? "exiftool";
  const result = spawnSync(binary, [...args, filePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "").trim();
    return { ok: false, message: msg.length > 0 ? msg : `exiftool exited ${result.status}` };
  }
  return { ok: true };
}

export function exiftoolAvailable(binary = "exiftool"): boolean {
  const result = spawnSync(binary, ["-ver"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

/** 出力画像に期待する XMP が付いているか簡易確認。 */
export function probeIptcXmp(
  filePath: string,
  expectedUri: string | undefined,
  binary = "exiftool",
): boolean {
  const result = spawnSync(
    binary,
    ["-s", "-s", "-s", "-G1", "-XMP-iptcExt:DigitalSourceType", filePath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) return false;
  const value = (result.stdout || "").trim();
  if (!expectedUri) return value.length > 0;
  return value === expectedUri || value.endsWith(expectedUri.split("/").pop() ?? "");
}