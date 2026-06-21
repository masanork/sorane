import { resolveLicenseUrl } from "./open-data.ts";
import { escapeHtml } from "./render.ts";

export interface SiteLicenseSpec {
  /** SPDX id (e.g. `MIT`, `CC-BY-4.0`) or HTTPS license URI. */
  readonly license?: string;
  /** Dist-relative license explanation page (e.g. `license.html`). */
  readonly license_page?: string;
  /** Copyright holder or full notice for the site footer (overrides `copyright_since` / `copyright_holder`). */
  readonly copyright?: string;
  /** First publication year; combined with build year when `copyright` is omitted. */
  readonly copyright_since?: number;
  /** Copyright holder name when `copyright` is omitted. */
  readonly copyright_holder?: string;
}

export interface ResolvedSiteLicense {
  readonly id: string;
  readonly url: string;
  readonly page?: string;
  readonly copyright?: string;
}

/** Build footer copyright text from explicit `copyright` or since/holder fields. */
export function resolveCopyrightNotice(
  site: SiteLicenseSpec,
  currentYear = new Date().getUTCFullYear(),
): string | undefined {
  const explicit = site.copyright?.trim();
  if (explicit) return explicit;

  const holder = site.copyright_holder?.trim();
  const since = site.copyright_since;
  if (since === undefined && !holder) return undefined;

  let years: string | undefined;
  if (since !== undefined) {
    years =
      since === currentYear ? String(since) : `${since}–${currentYear}`;
  }
  if (years && holder) return `${years} ${holder}`;
  return years ?? holder;
}

export function resolveSiteLicense(
  site: SiteLicenseSpec,
  currentYear = new Date().getUTCFullYear(),
): ResolvedSiteLicense | undefined {
  const id = site.license?.trim();
  if (!id) return undefined;
  return {
    id,
    url: resolveLicenseUrl(id),
    page: site.license_page?.trim() || undefined,
    copyright: resolveCopyrightNotice(site, currentYear),
  };
}

function formatCopyright(notice: string): string {
  return /^copyright/i.test(notice) ? notice : `© ${notice}`;
}

/** Footer meta line: license link and optional copyright. */
export function siteLicenseFooterMeta(
  license: ResolvedSiteLicense,
  rootPrefix: string,
): string {
  const href = license.page
    ? `${rootPrefix}${license.page.replace(/^\//, "")}`
    : license.url;
  const bits = [
    `<a href="${escapeHtml(href)}" rel="license">${escapeHtml(license.id)}</a>`,
  ];
  if (license.copyright) {
    bits.push(escapeHtml(formatCopyright(license.copyright)));
  }
  return `<p class="site-footer-meta">${bits.join(" · ")}</p>`;
}

export function llmsLicenseSection(
  license: ResolvedSiteLicense,
  baseUrl: string,
): readonly string[] {
  const absPage = (rel: string) =>
    /^https?:\/\//i.test(rel) || baseUrl.length === 0
      ? rel
      : `${baseUrl.replace(/\/$/, "")}/${rel.replace(/^\//, "")}`;
  const pageUrl = license.page ? absPage(license.page) : license.url;
  return [
    "",
    "## License",
    "",
    `Site content: [${license.id}](${pageUrl}) (${license.url})`,
  ];
}