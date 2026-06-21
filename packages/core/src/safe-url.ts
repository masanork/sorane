/** URL スキーム・形式の検証（XSS / オープンリダイレクト対策）。 */

const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file):/i;
const DANGEROUS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME =
  /^(https?:|mailto:|#|\/(?!\/)|\.(?!\.)|tel:)/i;

export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.startsWith("//")) return false;
  if (BLOCKED_SCHEMES.test(trimmed)) return false;
  if (SAFE_SCHEME.test(trimmed)) return true;
  if (DANGEROUS_SCHEME.test(trimmed)) return false;
  return true;
}

/** iframe / embed の src に許可する HTTPS のみ。 */
export function isSafeEmbedSrc(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function unsafeUrlReason(url: string): string | undefined {
  const trimmed = url.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith("//")) return "protocol-relative URLs are not allowed";
  if (BLOCKED_SCHEMES.test(trimmed)) return "blocked URL scheme";
  if (!SAFE_SCHEME.test(trimmed) && DANGEROUS_SCHEME.test(trimmed)) {
    return "unsupported URL scheme";
  }
  return undefined;
}

export function validateLinkHref(url: string): string | undefined {
  const reason = unsafeUrlReason(url);
  return reason ? `unsafe link URL (${reason}): ${url}` : undefined;
}

export function validateHttpNavUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (trimmed.length === 0) return "URL is empty";
  if (!isSafeUrl(trimmed)) {
    const reason = unsafeUrlReason(trimmed) ?? "unsafe URL";
    return `${reason}: ${trimmed}`;
  }
  return undefined;
}

export function isSameOriginUrl(target: string, baseUrl: string): boolean {
  const trimmed = target.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
  try {
    const base = new URL(baseUrl);
    const dest = new URL(trimmed);
    return base.origin === dest.origin;
  } catch {
    return false;
  }
}

export function validateRedirectTarget(
  to: string,
  opts?: { readonly sameOriginBase?: string },
): string | undefined {
  const trimmed = to.trim();
  if (!trimmed) return "redirect target is empty";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    if (!isSafeUrl(trimmed)) {
      return `redirect target uses unsafe URL: ${trimmed}`;
    }
    try {
      new URL(trimmed);
    } catch {
      return "redirect target is not a valid URL";
    }
    if (opts?.sameOriginBase && !isSameOriginUrl(trimmed, opts.sameOriginBase)) {
      return `redirect target must stay on ${new URL(opts.sameOriginBase).origin}`;
    }
    return undefined;
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return undefined;
  if (trimmed.startsWith("//")) return "protocol-relative redirect targets are not allowed";
  return "redirect target must be an absolute URL (http/https) or a path starting with /";
}