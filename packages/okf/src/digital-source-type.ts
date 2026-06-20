export const IPTC_BASE = "http://cv.iptc.org/newscodes/digitalsourcetype" as const;

export type EuAiLabel = "basic" | "fully-generated" | "partially-modified";

export const RETIRED_ALIASES: Readonly<Record<string, string>> = {
  digitalArt: "digitalCreation",
};

export const PHASE1_CODES = new Set([
  "trainedAlgorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
  "compositeSynthetic",
  "algorithmicMedia",
  "humanEdits",
  "digitalCreation",
]);

const EU_INFER: Readonly<Record<string, EuAiLabel | undefined>> = {
  trainedAlgorithmicMedia: "fully-generated",
  compositeWithTrainedAlgorithmicMedia: "partially-modified",
  compositeSynthetic: "partially-modified",
  algorithmicMedia: undefined,
  humanEdits: undefined,
  digitalCreation: undefined,
};

export interface ResolvedDigitalSourceType {
  readonly uri: string;
  readonly code: string;
  readonly warnings: readonly string[];
}

export function resolveDigitalSourceType(
  raw: string,
): ResolvedDigitalSourceType | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let code: string;
  const warnings: string[] = [];

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const normalized = trimmed.replace(/\/$/, "");
    const prefix = `${IPTC_BASE}/`;
    const httpUri = normalized.replace(/^https:\/\//, "http://");
    if (!httpUri.startsWith(prefix)) return null;
    code = httpUri.slice(prefix.length);
  } else {
    code = trimmed;
  }

  if (code in RETIRED_ALIASES) {
    const replacement = RETIRED_ALIASES[code]!;
    warnings.push(`${code} is retired; use ${replacement}`);
    code = replacement;
  }

  if (!PHASE1_CODES.has(code)) return null;

  return {
    uri: `${IPTC_BASE}/${code}`,
    code,
    warnings,
  };
}

export function inferEuLabel(
  code: string,
  override?: EuAiLabel,
): EuAiLabel | undefined {
  if (override) return override;
  return EU_INFER[code];
}

export function showsEuBadge(code: string, override?: EuAiLabel): boolean {
  if (override) return true;
  const inferred = EU_INFER[code];
  return inferred !== undefined;
}

export type EuAiLabelInput = EuAiLabel;

export function parseEuAiLabel(raw: unknown): EuAiLabel | undefined {
  if (raw === "basic" || raw === "fully-generated" || raw === "partially-modified") {
    return raw;
  }
  return undefined;
}

export interface AiSystemRef {
  readonly name: string;
  readonly version?: string;
  readonly provider?: string;
}

export function parseAiSystems(raw: unknown): AiSystemRef[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AiSystemRef[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return undefined;
    const name = (item as Record<string, unknown>).name;
    if (typeof name !== "string" || name.length === 0) return undefined;
    const version = (item as Record<string, unknown>).version;
    const provider = (item as Record<string, unknown>).provider;
    out.push({
      name,
      version: typeof version === "string" ? version : undefined,
      provider: typeof provider === "string" ? provider : undefined,
    });
  }
  return out;
}

const DISCLOSURE_KEYS = new Set([
  "digitalSourceType",
  "euAiLabel",
  "aiDisclosureNote",
  "aiSystems",
]);

export function hasDisclosureKeys(frontmatter: Record<string, unknown>): boolean {
  return Object.keys(frontmatter).some((k) => DISCLOSURE_KEYS.has(k));
}

export interface DisclosureValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function validateDisclosureFields(
  frontmatter: Record<string, unknown>,
  strictCodes: boolean,
): { readonly issues: DisclosureValidationIssue[]; readonly warnings: string[] } {
  const issues: DisclosureValidationIssue[] = [];
  const warnings: string[] = [];

  if (!hasDisclosureKeys(frontmatter)) {
    return { issues, warnings };
  }

  const digitalSourceType = frontmatter.digitalSourceType;
  const euAiLabel = frontmatter.euAiLabel;
  const aiDisclosureNote = frontmatter.aiDisclosureNote;
  const aiSystems = frontmatter.aiSystems;

  const hasDst =
    typeof digitalSourceType === "string" && digitalSourceType.trim().length > 0;

  if (
    (euAiLabel !== undefined && euAiLabel !== null && euAiLabel !== "") ||
    (Array.isArray(aiSystems) && aiSystems.length > 0) ||
    (typeof aiDisclosureNote === "string" && aiDisclosureNote.trim().length > 0)
  ) {
    if (!hasDst) {
      issues.push({
        path: "digitalSourceType",
        message: "digitalSourceType is required when other AI disclosure fields are set",
      });
    }
  }

  if (euAiLabel !== undefined && euAiLabel !== null && euAiLabel !== "") {
    if (!parseEuAiLabel(euAiLabel)) {
      issues.push({
        path: "euAiLabel",
        message: "euAiLabel must be basic, fully-generated, or partially-modified",
      });
    }
  }

  if (aiSystems !== undefined && parseAiSystems(aiSystems) === undefined) {
    issues.push({
      path: "aiSystems",
      message: "aiSystems must be an array of { name, version?, provider? }",
    });
  }

  if (typeof aiDisclosureNote === "string" && aiDisclosureNote.length > 500) {
    issues.push({
      path: "aiDisclosureNote",
      message: "aiDisclosureNote must be at most 500 characters",
    });
  }

  if (hasDst && typeof digitalSourceType === "string") {
    const resolved = resolveDigitalSourceType(digitalSourceType);
    if (!resolved) {
      const msg = `unknown digitalSourceType: ${digitalSourceType}`;
      if (strictCodes) {
        issues.push({ path: "digitalSourceType", message: msg });
      } else {
        warnings.push(msg);
      }
    } else {
      warnings.push(...resolved.warnings);
    }
  }

  return { issues, warnings };
}