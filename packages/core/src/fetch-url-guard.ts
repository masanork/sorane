import { lookup } from "node:dns/promises";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

function isPrivateIpv4(a: number, b: number, c: number): boolean {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  void c;
  return false;
}

function isPrivateIpv6(addr: string): boolean {
  const n = addr.toLowerCase();
  return (
    n === "::1" ||
    n.startsWith("fc") ||
    n.startsWith("fd") ||
    n.startsWith("fe80") ||
    n === "::"
  );
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (host.length === 0) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  if (host.endsWith(".internal")) return true;
  return false;
}

export function isBlockedIpAddress(address: string): boolean {
  // IPv6 literals (may include zone id); non-IP hostnames are not blocked here
  // (see isBlockedHostname + DNS resolution in assertFetchUrlAllowed).
  if (address.includes(":")) return isPrivateIpv6(address);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!m) return false;
  const parts = [m[1], m[2], m[3], m[4]].map((p) => Number.parseInt(p!, 10));
  if (parts.some((p) => !Number.isFinite(p) || p! < 0 || p! > 255)) return true;
  return isPrivateIpv4(parts[0]!, parts[1]!, parts[2]!);
}

export async function assertFetchUrlAllowed(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid fetch URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`unsupported fetch scheme: ${parsed.protocol}`);
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`blocked fetch host: ${parsed.hostname}`);
  }
  if (isBlockedIpAddress(parsed.hostname)) {
    throw new Error(`blocked fetch address: ${parsed.hostname}`);
  }
  const records = await lookup(parsed.hostname, { all: true });
  for (const rec of records) {
    if (isBlockedIpAddress(rec.address)) {
      throw new Error(`blocked fetch address for ${parsed.hostname}: ${rec.address}`);
    }
  }
}

export interface GuardedFetchOptions {
  readonly fetchFn?: typeof fetch;
  readonly maxRedirects?: number;
  readonly maxBytes?: number;
}

export async function guardedFetch(
  url: string,
  init: RequestInit = {},
  opts: GuardedFetchOptions = {},
): Promise<Response> {
  const fetchFn = opts.fetchFn ?? fetch;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertFetchUrlAllowed(current);
    const response = await fetchFn(current, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === maxRedirects) {
        throw new Error(`too many redirects fetching ${url}`);
      }
      current = new URL(location, current).href;
      continue;
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(`response too large (${length} bytes) for ${current}`);
    }
    return response;
  }
  throw new Error(`redirect loop fetching ${url}`);
}

export async function readGuardedResponse(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) throw new Error("response body exceeds size limit");
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}