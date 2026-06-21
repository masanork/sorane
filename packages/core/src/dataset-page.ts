import type { OkfConcept } from "@sorane/okf";
import {
  isKnownLicenseId,
  parseDistributions,
  parsePublisher,
  resolveDistributionUrl,
  resolveLicenseUrl,
  validateEuThemeWarnings,
  type DistributionRef,
} from "./open-data.ts";
import { escapeHtml } from "./render.ts";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function distributionRow(
  dist: DistributionRef,
  pageUrl: string,
  baseUrl: string,
): string {
  const href = resolveDistributionUrl(dist.accessURL, baseUrl, pageUrl);
  const size =
    dist.byteSize !== undefined ? ` <span class="dataset-size">(${formatBytes(dist.byteSize)})</span>` : "";
  const checksum = dist.checksum
    ? `<div class="dataset-checksum"><code>${escapeHtml(dist.checksum)}</code></div>`
    : "";
  return (
    `<tr>` +
    `<td>${escapeHtml(dist.title)}</td>` +
    `<td><code>${escapeHtml(dist.format)}</code></td>` +
    `<td><a href="${escapeHtml(href)}">${escapeHtml(href)}</a>${size}${checksum}</td>` +
    `</tr>`
  );
}

/** `type: dataset` 向けの warning（schema エラー以外）。 */
export function validateDatasetWarnings(frontmatter: Record<string, unknown>): readonly string[] {
  const warnings: string[] = [];
  const licenseRaw = frontmatter.license;
  if (typeof licenseRaw === "string" && licenseRaw.length > 0 && !isKnownLicenseId(licenseRaw)) {
    warnings.push(
      `dataset: unknown license "${licenseRaw}"; use SPDX id (e.g. CC-BY-4.0) or HTTPS URI`,
    );
  }
  for (const dist of parseDistributions(frontmatter.distributions)) {
    if (/^http:\/\//i.test(dist.accessURL.trim())) {
      warnings.push(
        `dataset: distribution "${dist.title}" uses http:// accessURL; prefer https://`,
      );
    }
  }
  warnings.push(...validateEuThemeWarnings(frontmatter.theme, "dataset"));
  const publisher = parsePublisher(frontmatter.publisher);
  if (
    (typeof licenseRaw === "string" && licenseRaw.length > 0) ||
    parseDistributions(frontmatter.distributions).length > 0
  ) {
    if (!publisher) {
      warnings.push("dataset: publisher.name is recommended when license or distributions are set");
    }
  }
  return warnings;
}

/** Dataset landing: metadata block + distribution table + rendered body. */
export function renderDatasetPageBody(
  concept: OkfConcept,
  bodyHtml: string,
  opts: { readonly pageUrl: string; readonly baseUrl: string },
): string {
  const licenseRaw = concept.frontmatter.license;
  const license =
    typeof licenseRaw === "string" && licenseRaw.length > 0
      ? resolveLicenseUrl(licenseRaw)
      : undefined;
  const publisher = parsePublisher(concept.frontmatter.publisher);
  const distributions = parseDistributions(concept.frontmatter.distributions);
  const identifier = concept.frontmatter.identifier;
  const theme = concept.frontmatter.theme;
  const language = concept.frontmatter.language;

  const meta: string[] = [];
  if (license) {
    meta.push(
      `<p class="dataset-meta"><strong>License:</strong> <a href="${escapeHtml(license)}">${escapeHtml(String(licenseRaw))}</a></p>`,
    );
  }
  if (publisher) {
    const pub =
      publisher.url !== undefined
        ? `<a href="${escapeHtml(publisher.url)}">${escapeHtml(publisher.name)}</a>`
        : escapeHtml(publisher.name);
    meta.push(`<p class="dataset-meta"><strong>Publisher:</strong> ${pub}</p>`);
  }
  if (typeof identifier === "string" && identifier.length > 0) {
    meta.push(
      `<p class="dataset-meta"><strong>Identifier:</strong> <code>${escapeHtml(identifier)}</code></p>`,
    );
  }
  if (typeof theme === "string" && theme.length > 0) {
    meta.push(`<p class="dataset-meta"><strong>Theme:</strong> <code>${escapeHtml(theme)}</code></p>`);
  }
  if (typeof language === "string" && language.length > 0) {
    meta.push(`<p class="dataset-meta"><strong>Language:</strong> <code>${escapeHtml(language)}</code></p>`);
  }
  if (concept.resource) {
    meta.push(
      `<p class="dataset-meta"><strong>Resource:</strong> <a href="${escapeHtml(concept.resource)}">${escapeHtml(concept.resource)}</a></p>`,
    );
  }

  const table =
    distributions.length > 0
      ? `<section class="dataset-distributions" aria-labelledby="dataset-distributions-heading">` +
        `<h2 id="dataset-distributions-heading">Distributions</h2>` +
        `<table class="dataset-table"><thead><tr><th>Name</th><th>Format</th><th>Access</th></tr></thead><tbody>` +
        distributions
          .map((d) => distributionRow(d, opts.pageUrl, opts.baseUrl))
          .join("") +
        `</tbody></table></section>`
      : "";

  return (
    `<div class="dataset-landing">` +
    meta.join("") +
    table +
    `</div>` +
    `<div class="dataset-body">${bodyHtml}</div>`
  );
}