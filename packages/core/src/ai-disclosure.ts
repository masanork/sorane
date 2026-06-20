import {
  inferEuLabel,
  parseAiSystems,
  parseEuAiLabel,
  resolveDigitalSourceType,
  showsEuBadge,
  type AiSystemRef,
  type EuAiLabel,
} from "@sorane/okf";
import { escapeHtml } from "./render.ts";
import { siteLabels } from "./site-labels.ts";

export type { AiSystemRef, EuAiLabel };

export interface AiDisclosure {
  readonly digitalSourceType: string;
  readonly digitalSourceCode: string;
  readonly euLabel?: EuAiLabel;
  readonly note?: string;
  readonly systems?: readonly AiSystemRef[];
  readonly showBadge: boolean;
}

export interface AiDisclosureConfig {
  readonly enabled?: boolean;
  readonly badges?: boolean;
  readonly json_ld?: boolean;
  readonly machine_readable?: boolean;
  readonly atom?: boolean;
  readonly show_on_lists?: boolean;
  readonly policy_url?: string;
}

export interface ResolvedAiDisclosureFlags {
  readonly badges: boolean;
  readonly jsonLd: boolean;
  readonly machineReadable: boolean;
  readonly atom: boolean;
  readonly showOnLists: boolean;
  readonly policyUrl?: string;
}

export function parseAiDisclosure(
  frontmatter: Record<string, unknown>,
): AiDisclosure | null {
  const raw = frontmatter.digitalSourceType;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  const resolved = resolveDigitalSourceType(raw);
  if (!resolved) return null;

  const euOverride = parseEuAiLabel(frontmatter.euAiLabel);
  const note =
    typeof frontmatter.aiDisclosureNote === "string" &&
    frontmatter.aiDisclosureNote.trim().length > 0
      ? frontmatter.aiDisclosureNote.trim()
      : undefined;
  const systems = parseAiSystems(frontmatter.aiSystems);

  const showBadge = showsEuBadge(resolved.code, euOverride);
  const euLabel = showBadge
    ? (euOverride ?? inferEuLabel(resolved.code))
    : euOverride;

  return {
    digitalSourceType: resolved.uri,
    digitalSourceCode: resolved.code,
    euLabel,
    note,
    systems,
    showBadge: showBadge && euLabel !== undefined,
  };
}

export function resolveAiDisclosureFlags(
  config: AiDisclosureConfig | undefined,
  hasDisclosureOnPage: boolean,
): ResolvedAiDisclosureFlags {
  const enabled = config?.enabled !== false;
  const badges = config?.badges ?? enabled;
  const jsonLd =
    config?.json_ld ?? (hasDisclosureOnPage ? true : false);
  const machineReadable =
    config?.machine_readable ?? (hasDisclosureOnPage ? true : false);
  const atom = config?.atom ?? machineReadable;
  const showOnLists = config?.show_on_lists ?? false;

  return {
    badges: badges && hasDisclosureOnPage,
    jsonLd: jsonLd && hasDisclosureOnPage,
    machineReadable: machineReadable && hasDisclosureOnPage,
    atom: atom && hasDisclosureOnPage,
    showOnLists: showOnLists && hasDisclosureOnPage,
    policyUrl: config?.policy_url,
  };
}

function euLabelFile(label: EuAiLabel): string {
  if (label === "fully-generated") return "fully-generated";
  if (label === "partially-modified") return "partially-modified";
  return "basic";
}

function disclosureTitle(label: EuAiLabel, lang: string): string {
  const ja = lang.startsWith("ja");
  if (label === "fully-generated") {
    return ja ? "AI により完全生成されたコンテンツ" : "Fully AI-generated content";
  }
  if (label === "partially-modified") {
    return ja ? "AI により部分的に改変されたコンテンツ" : "Partially AI-modified content";
  }
  return ja ? "AI が関与したコンテンツ" : "AI-involved content";
}

export function buildAiBadgeHtml(
  d: AiDisclosure,
  opts: {
    readonly lang: string;
    readonly rootPrefix: string;
    readonly policyUrl?: string;
  },
): string {
  if (!d.showBadge || !d.euLabel) return "";
  const label = d.euLabel;
  const icon = `${opts.rootPrefix}assets/ai-labels/${euLabelFile(label)}.svg`;
  const title = disclosureTitle(label, opts.lang);
  const detail = d.note ? `<p class="ai-disclosure-detail">${escapeHtml(d.note)}</p>` : "";
  const policy = opts.policyUrl
    ? `<p class="ai-disclosure-policy"><a href="${escapeHtml(opts.policyUrl)}">${escapeHtml(siteLabels(opts.lang).aiPolicyLink)}</a></p>`
    : "";
  const meta =
    `<p class="ai-disclosure-meta">` +
    `<a href="${escapeHtml(d.digitalSourceType)}" rel="external noopener">` +
    `IPTC: ${escapeHtml(d.digitalSourceCode)}</a></p>`;
  return (
    `<aside class="ai-disclosure ai-disclosure--${escapeHtml(label)}" role="note" ` +
    `aria-label="${escapeHtml(siteLabels(opts.lang).aiDisclosureAria)}">\n` +
    `<img class="ai-disclosure-icon" src="${escapeHtml(icon)}" alt="" width="32" height="32" decoding="async" />\n` +
    `<div class="ai-disclosure-text">\n` +
    `<p class="ai-disclosure-title">${escapeHtml(title)}</p>\n` +
    `${detail}\n` +
    `${meta}\n` +
    `${policy}\n` +
    `</div>\n` +
    `</aside>\n`
  );
}

export function buildCompactAiBadgeHtml(
  d: AiDisclosure,
  opts: { readonly rootPrefix: string },
): string {
  if (!d.showBadge || !d.euLabel) return "";
  const icon = `${opts.rootPrefix}assets/ai-labels/${euLabelFile(d.euLabel)}.svg`;
  return (
    `<img class="ai-disclosure-compact" src="${escapeHtml(icon)}" ` +
    `alt="AI" width="20" height="20" decoding="async" />\n`
  );
}

export function aiDisclosureJsonLdFields(
  d: AiDisclosure,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    digitalSourceType: d.digitalSourceType,
  };
  if (d.note) {
    fields.disambiguatingDescription = d.note;
  }
  if (d.systems?.length) {
    fields.contributor = d.systems.map((s) => ({
      "@type": "SoftwareApplication",
      name: s.name,
      ...(s.version ? { softwareVersion: s.version } : {}),
      ...(s.provider
        ? { author: { "@type": "Organization", name: s.provider } }
        : {}),
    }));
  }
  return fields;
}