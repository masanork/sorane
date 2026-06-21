export const SUPPORTED_PROFILE_RE = /^sorane-okf\/(0\.[123])$/;
export const DEFAULT_PROFILE = "sorane-okf/0.1";

export const TYPES_01_02 = new Set(["article", "index"]);

export const TYPES_03 = new Set([
  "article",
  "index",
  "dataset",
  "reference",
  "glossary",
  "glossary-term",
  "faq",
]);

export const BUILDABLE_CONTENT_TYPES = new Set([
  "article",
  "dataset",
  "reference",
  "glossary",
  "glossary-term",
  "faq",
]);

export function profileMajor(profile: string | undefined): "0.1" | "0.2" | "0.3" | null {
  if (profile === undefined) return null;
  const m = profile.match(/^sorane-okf\/(0\.[123])$/);
  if (!m) return null;
  return m[1] as "0.1" | "0.2" | "0.3";
}

export function isProfile03(profile: string | undefined): boolean {
  return profile === "sorane-okf/0.3";
}

export function resolveProfileForValidation(
  profile: string | undefined,
  siteDefaultProfile?: string,
): string {
  if (profile !== undefined && SUPPORTED_PROFILE_RE.test(profile)) {
    return profile;
  }
  if (
    siteDefaultProfile !== undefined &&
    SUPPORTED_PROFILE_RE.test(siteDefaultProfile)
  ) {
    return siteDefaultProfile;
  }
  return DEFAULT_PROFILE;
}

/** Build/validate effective type (0.3 unknown types → article). */
export function resolveEffectiveType(
  type: string,
  profile: string | undefined,
): string {
  if (!type) return "";
  if (isProfile03(profile)) {
    if (TYPES_03.has(type)) return type;
    return "article";
  }
  return type;
}

export function isBuildableContentType(
  type: string,
  profile: string | undefined,
): boolean {
  const effective = resolveEffectiveType(type, profile);
  return BUILDABLE_CONTENT_TYPES.has(effective);
}