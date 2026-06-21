export interface PublisherRef {
  readonly name: string;
  readonly url?: string;
  readonly email?: string;
}

export interface DistributionRef {
  readonly title: string;
  readonly format: string;
  readonly accessURL: string;
  readonly downloadURL?: string;
  readonly byteSize?: number;
  readonly checksum?: string;
}

const SPDX_LICENSE_URL: Record<string, string> = {
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "EUPL-1.2": "https://interoperable.europe.eu/collection/eupl/eupl-text-eupl-12",
};

const FORMAT_MEDIA: Record<string, string> = {
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  jsonld: "application/ld+json",
  xml: "application/xml",
  pdf: "application/pdf",
  md: "text/markdown",
  html: "text/html",
  parquet: "application/vnd.apache.parquet",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function isKnownLicenseId(license: string): boolean {
  const trimmed = license.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed in SPDX_LICENSE_URL;
}

export function resolveLicenseUrl(license: string): string {
  const trimmed = license.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return SPDX_LICENSE_URL[trimmed] ?? trimmed;
}

export function resolveMediaType(format: string): string {
  const key = format.trim().toLowerCase();
  if (FORMAT_MEDIA[key]) return FORMAT_MEDIA[key]!;
  if (key.includes("/")) return key;
  return key;
}

export function parsePublisher(
  raw: unknown,
): PublisherRef | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const name = (raw as { name?: unknown }).name;
  if (typeof name !== "string" || name.length === 0) return undefined;
  const url = (raw as { url?: unknown }).url;
  const email = (raw as { email?: unknown }).email;
  return {
    name,
    url: typeof url === "string" && url.length > 0 ? url : undefined,
    email: typeof email === "string" && email.length > 0 ? email : undefined,
  };
}

export function parseDistributions(
  raw: unknown,
): readonly DistributionRef[] {
  if (!Array.isArray(raw)) return [];
  const out: DistributionRef[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const title = (item as { title?: unknown }).title;
    const format = (item as { format?: unknown }).format;
    const accessURL = (item as { accessURL?: unknown }).accessURL;
    if (
      typeof title !== "string" ||
      title.length === 0 ||
      typeof format !== "string" ||
      format.length === 0 ||
      typeof accessURL !== "string" ||
      accessURL.length === 0
    ) {
      continue;
    }
    const downloadURL = (item as { downloadURL?: unknown }).downloadURL;
    const byteSize = (item as { byteSize?: unknown }).byteSize;
    const checksum = (item as { checksum?: unknown }).checksum;
    out.push({
      title,
      format,
      accessURL,
      downloadURL:
        typeof downloadURL === "string" && downloadURL.length > 0
          ? downloadURL
          : undefined,
      byteSize:
        typeof byteSize === "number" && Number.isFinite(byteSize) && byteSize >= 0
          ? byteSize
          : undefined,
      checksum:
        typeof checksum === "string" && checksum.length > 0 ? checksum : undefined,
    });
  }
  return out;
}

/** Resolve distribution URL against site base (absolute URLs unchanged). */
export function resolveDistributionUrl(
  accessURL: string,
  baseUrl: string,
  pageUrl: string,
): string {
  const trimmed = accessURL.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) {
    return baseUrl.length > 0 ? `${baseUrl}${trimmed}` : trimmed;
  }
  try {
    return new URL(trimmed, pageUrl).href;
  } catch {
    return trimmed;
  }
}