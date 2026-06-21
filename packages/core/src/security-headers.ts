import type { SecurityConfig } from "./config.ts";

export type CspProfile = "standard" | "strict";

export function resolveCspProfile(security?: SecurityConfig): CspProfile {
  return security?.csp_profile === "strict" ? "strict" : "standard";
}

export function buildContentSecurityPolicy(profile: CspProfile, hybridSearch: boolean): string {
  const scriptSrc =
    profile === "strict"
      ? ["'self'"]
      : ["'self'", "https://static.cloudflareinsights.com"];
  if (hybridSearch) {
    scriptSrc.push("'wasm-unsafe-eval'");
  }
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

export function buildSecurityHeadersFile(
  security: SecurityConfig | undefined,
  opts: { readonly hybridSearch?: boolean } = {},
): string {
  const profile = resolveCspProfile(security);
  const csp = buildContentSecurityPolicy(profile, opts.hybridSearch === true);
  return (
    "/*\n" +
    "  X-Content-Type-Options: nosniff\n" +
    "  Referrer-Policy: strict-origin-when-cross-origin\n" +
    "  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), microphone=()\n" +
    `  Content-Security-Policy: ${csp}\n` +
    "  X-Frame-Options: DENY\n" +
    "\n" +
    "/assets/*\n" +
    "  Cache-Control: public, max-age=31536000, immutable\n"
  );
}