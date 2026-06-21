import type { SoraneConfig } from "./config.ts";
import { validateHttpNavUrl } from "./safe-url.ts";
import { escapeHtml } from "./render.ts";
import { siteLabels } from "./site-labels.ts";

export type EmergencySeverity = "info" | "warning" | "emergency";

export interface EmergencyMessageSpec {
  readonly message: string;
  readonly severity?: EmergencySeverity;
  readonly href?: string;
  readonly link_text?: string;
}

export interface SiteEmergencyConfig {
  readonly message?: string;
  readonly severity?: EmergencySeverity;
  readonly href?: string;
  readonly link_text?: string;
  /** ロケール ID（`site.i18n.locales` のキー）ごとの上書き */
  readonly locales?: Readonly<Record<string, EmergencyMessageSpec>>;
}

export interface ResolvedEmergencyBanner {
  readonly message: string;
  readonly severity: EmergencySeverity;
  readonly href?: string;
  readonly linkText?: string;
}

function trimMessage(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t && t.length > 0 ? t : undefined;
}

function specFromPartial(
  base: EmergencyMessageSpec | undefined,
  fallback?: EmergencyMessageSpec,
): ResolvedEmergencyBanner | undefined {
  const message = trimMessage(base?.message ?? fallback?.message);
  if (!message) return undefined;
  const severity = base?.severity ?? fallback?.severity ?? "warning";
  const href = trimMessage(base?.href ?? fallback?.href);
  const linkText = trimMessage(base?.link_text ?? fallback?.link_text);
  return { message, severity, href, linkText };
}

/** ロケール向けに緊急バナー設定を解決する。message 無しなら undefined。 */
export function resolveEmergencyBanner(
  site: SoraneConfig["site"],
  localeId: string,
): ResolvedEmergencyBanner | undefined {
  const raw = site.emergency;
  if (!raw) return undefined;
  const defaultSpec: EmergencyMessageSpec = {
    message: raw.message ?? "",
    severity: raw.severity,
    href: raw.href,
    link_text: raw.link_text,
  };
  const localeSpec =
    localeId !== "default" ? raw.locales?.[localeId] : undefined;
  return specFromPartial(localeSpec, defaultSpec);
}

/** 全ページ共通の緊急告知 HTML（`role="alert"`）。 */
export function emergencyBannerHtml(
  banner: ResolvedEmergencyBanner,
  lang: string,
): string {
  const labels = siteLabels(lang);
  const message = escapeHtml(banner.message);
  const safeHref =
    banner.href && validateHttpNavUrl(banner.href) === undefined ? banner.href : undefined;
  const link =
    safeHref && banner.linkText
      ? ` <a href="${escapeHtml(safeHref)}">${escapeHtml(banner.linkText)}</a>`
      : safeHref
        ? ` <a href="${escapeHtml(safeHref)}">${escapeHtml(labels.emergencyLink)}</a>`
        : "";
  return (
    `<div class="emergency-banner emergency-banner--${escapeHtml(banner.severity)}" role="alert">` +
    `<p class="emergency-banner-text">${message}${link}</p>` +
    `</div>`
  );
}