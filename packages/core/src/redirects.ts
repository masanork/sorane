import type { ParsedConcept } from "@sorane/okf";
import type { RedirectRuleConfig, SoraneConfig } from "./config.ts";
import { resolvePageLocaleInfo, type I18nContext } from "./i18n.ts";

export const DEFAULT_REDIRECT_STATUS = 301;

export const ALLOWED_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface RedirectRule {
  readonly from: string;
  readonly to: string;
  readonly status: number;
}

export function isRedirectPage(frontmatter: Record<string, unknown>): boolean {
  const redirect = frontmatter.redirect;
  return typeof redirect === "string" && redirect.trim().length > 0;
}

export function parseRedirectStatus(frontmatter: Record<string, unknown>): number {
  const raw = frontmatter.redirect_status ?? frontmatter.redirectStatus;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number.parseInt(raw.trim(), 10);
  return DEFAULT_REDIRECT_STATUS;
}

export function normalizeRedirectFrom(from: string): string {
  const trimmed = from.trim();
  if (!trimmed) throw new Error("redirect from is empty");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function normalizeRedirectTo(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) throw new Error("redirect to is empty");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** @returns error message, or undefined when valid */
export function validateRedirectTarget(to: string): string | undefined {
  const trimmed = to.trim();
  if (!trimmed) return "redirect target is empty";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      new URL(trimmed);
      return undefined;
    } catch {
      return "redirect target is not a valid URL";
    }
  }
  if (trimmed.startsWith("/")) return undefined;
  return "redirect target must be an absolute URL (http/https) or a path starting with /";
}

export function validateRedirectStatus(status: number): string | undefined {
  if (!ALLOWED_REDIRECT_STATUSES.has(status)) {
    return `redirect status must be one of ${[...ALLOWED_REDIRECT_STATUSES].sort((a, b) => a - b).join(", ")}`;
  }
  return undefined;
}

export function redirectFromOutRel(outRel: string): string {
  return normalizeRedirectFrom(outRel.replace(/\\/g, "/"));
}

export function redirectRulesFromConfig(
  rules: readonly RedirectRuleConfig[] | undefined,
): RedirectRule[] {
  if (!rules || rules.length === 0) return [];
  return rules.map((rule) => {
    const status = rule.status ?? DEFAULT_REDIRECT_STATUS;
    return {
      from: normalizeRedirectFrom(rule.from),
      to: normalizeRedirectTo(rule.to),
      status,
    };
  });
}

export function redirectRuleFromFrontmatter(
  frontmatter: Record<string, unknown>,
  outRel: string,
): RedirectRule | undefined {
  const target = frontmatter.redirect;
  if (typeof target !== "string" || target.trim().length === 0) return undefined;
  const status = parseRedirectStatus(frontmatter);
  return {
    from: redirectFromOutRel(outRel),
    to: normalizeRedirectTo(target),
    status,
  };
}

export function mergeRedirectRules(
  rules: readonly RedirectRule[],
): { readonly merged: readonly RedirectRule[]; readonly duplicates: readonly string[] } {
  const seen = new Map<string, RedirectRule>();
  const duplicates: string[] = [];
  for (const rule of rules) {
    if (seen.has(rule.from)) duplicates.push(rule.from);
    seen.set(rule.from, rule);
  }
  return { merged: [...seen.values()], duplicates };
}

export function formatRedirectsFile(rules: readonly RedirectRule[]): string {
  if (rules.length === 0) return "";
  return `${rules.map((r) => `${r.from} ${r.to} ${r.status}`).join("\n")}\n`;
}

export function collectContentRedirectRules(
  parsed: readonly ParsedConcept[],
  config: SoraneConfig,
  i18n: I18nContext,
): RedirectRule[] {
  const rules: RedirectRule[] = [];
  for (const p of parsed) {
    if (!isRedirectPage(p.concept.frontmatter)) continue;
    const { outRel } = resolvePageLocaleInfo(p, config, i18n);
    const rule = redirectRuleFromFrontmatter(p.concept.frontmatter, outRel);
    if (rule) rules.push(rule);
  }
  return rules;
}

export function collectAllRedirectRules(
  parsed: readonly ParsedConcept[],
  config: SoraneConfig,
  i18n: I18nContext,
): { readonly rules: readonly RedirectRule[]; readonly duplicates: readonly string[] } {
  const combined = [
    ...redirectRulesFromConfig(config.build.redirects),
    ...collectContentRedirectRules(parsed, config, i18n),
  ];
  const { merged, duplicates } = mergeRedirectRules(combined);
  return { rules: merged, duplicates };
}

export interface RedirectValidationFinding {
  readonly severity: "error" | "warning";
  readonly message: string;
}

export function validateRedirectFrontmatter(
  frontmatter: Record<string, unknown>,
): RedirectValidationFinding[] {
  if (!isRedirectPage(frontmatter)) return [];
  const findings: RedirectValidationFinding[] = [];
  const target = frontmatter.redirect;
  if (typeof target === "string") {
    const targetErr = validateRedirectTarget(target);
    if (targetErr) findings.push({ severity: "error", message: targetErr });
  }
  const status = parseRedirectStatus(frontmatter);
  const statusErr = validateRedirectStatus(status);
  if (statusErr) findings.push({ severity: "error", message: statusErr });
  return findings;
}

export function validateRedirectConfigRules(
  rules: readonly RedirectRuleConfig[] | undefined,
): RedirectValidationFinding[] {
  if (!rules || rules.length === 0) return [];
  const findings: RedirectValidationFinding[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    const label = `build.redirects[${i}]`;
    if (!rule.from?.trim()) {
      findings.push({ severity: "error", message: `${label}: from is required` });
      continue;
    }
    if (!rule.to?.trim()) {
      findings.push({ severity: "error", message: `${label}: to is required` });
      continue;
    }
    try {
      const from = normalizeRedirectFrom(rule.from);
      const toErr = validateRedirectTarget(rule.to);
      if (toErr) findings.push({ severity: "error", message: `${label}: ${toErr}` });
      const status = rule.status ?? DEFAULT_REDIRECT_STATUS;
      const statusErr = validateRedirectStatus(status);
      if (statusErr) findings.push({ severity: "error", message: `${label}: ${statusErr}` });
      if (seen.has(from)) {
        findings.push({ severity: "error", message: `duplicate redirect from path: ${from}` });
      } else {
        seen.add(from);
      }
    } catch (err) {
      findings.push({
        severity: "error",
        message: `${label}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return findings;
}

export function validateRedirectCollisions(
  parsed: readonly ParsedConcept[],
  config: SoraneConfig,
  i18n: I18nContext,
): RedirectValidationFinding[] {
  const { duplicates } = collectAllRedirectRules(parsed, config, i18n);
  return duplicates.map((from) => ({
    severity: "error" as const,
    message: `duplicate redirect from path: ${from}`,
  }));
}