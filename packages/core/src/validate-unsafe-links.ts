import { validateLinkHref, validateHttpNavUrl } from "./safe-url.ts";
import type { QualityGateSeverity } from "./config.ts";
import type { SoraneConfig } from "./config.ts";
import { resolveSecurityConfig } from "./config.ts";

const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HTML_HREF_RE = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi;
const HTML_SRC_RE = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/gi;
const RAW_EMBED_RE = /<(iframe|embed|object|script)\b/i;

export interface UnsafeLinkFinding {
  readonly message: string;
  readonly line?: number;
}

function gateSeverity(
  config: SoraneConfig,
): QualityGateSeverity | false {
  const security = resolveSecurityConfig(config);
  const mode = security.link_scheme_check;
  if (mode === false) return false;
  return mode === "error" ? "error" : "warn";
}

export function validateMarkdownLinkSchemes(
  body: string,
): readonly UnsafeLinkFinding[] {
  const findings: UnsafeLinkFinding[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const re of [MD_IMAGE_RE, MD_LINK_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const href = (m[2] ?? "").trim();
        if (!href || href.startsWith("#")) continue;
        const err = validateLinkHref(href);
        if (err) findings.push({ message: `${err} (line ${i + 1})`, line: i + 1 });
      }
    }
  }
  return findings;
}

export function validateHtmlUnsafeEmbeds(body: string): readonly UnsafeLinkFinding[] {
  const findings: UnsafeLinkFinding[] = [];
  if (RAW_EMBED_RE.test(body)) {
    findings.push({
      message:
        "raw HTML contains iframe/embed/object/script; use strict import or remove embeds",
    });
  }
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const re of [HTML_HREF_RE, HTML_SRC_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const href = (m[2] ?? m[3] ?? "").trim();
        if (!href || href.startsWith("#")) continue;
        const err = validateLinkHref(href);
        if (err) findings.push({ message: `${err} (line ${i + 1})`, line: i + 1 });
      }
    }
  }
  return findings;
}

export function validateEmergencyBannerUrls(
  site: SoraneConfig["site"],
): readonly UnsafeLinkFinding[] {
  const findings: UnsafeLinkFinding[] = [];
  const raw = site.emergency;
  if (!raw) return findings;
  const specs = [raw, ...Object.values(raw.locales ?? {})];
  for (const spec of specs) {
    if (!spec?.href) continue;
    const err = validateHttpNavUrl(spec.href);
    if (err) findings.push({ message: `emergency banner href ${err}` });
  }
  return findings;
}

export function validateUnsafeLinkFindings(
  body: string,
  config: SoraneConfig,
): readonly UnsafeLinkFinding[] {
  const security = resolveSecurityConfig(config);
  const findings = [...validateMarkdownLinkSchemes(body)];
  for (const f of validateHtmlUnsafeEmbeds(body)) {
    if (f.message.includes("iframe/embed/object/script")) {
      if (security.strict_html || !security.allow_embeds) findings.push(f);
      continue;
    }
    findings.push(f);
  }
  return findings;
}

export function linkSchemeGateEnabled(config: SoraneConfig): boolean {
  return gateSeverity(config) !== false;
}

export function linkSchemeGateSeverity(
  config: SoraneConfig,
): "error" | "warning" {
  const mode = gateSeverity(config);
  if (mode === false || mode === "warn") return "warning";
  return "error";
}