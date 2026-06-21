import type { SoraneConfig } from "./config.ts";
import { resolveSecurityConfig } from "./config.ts";
import type { ValidateFinding } from "./validate-site.ts";
import { validateEmergencyBannerUrls } from "./validate-unsafe-links.ts";

const KNOWN_BINARIES: Record<string, readonly string[]> = {
  d2: ["d2"],
  dot: ["dot"],
  mmdc: ["mmdc"],
  exiftool: ["exiftool"],
  c2patool: ["c2patool"],
  pandoc: ["pandoc"],
  vivliostyle: ["vivliostyle"],
};

function basenameOnly(path: string): string {
  const trimmed = path.trim();
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function validateBinaryField(
  label: string,
  value: string | undefined,
  allowed: readonly string[],
): string | undefined {
  if (!value) return undefined;
  const base = basenameOnly(value);
  if (base.includes("/") || base.includes("\\") || base.includes("..")) {
    return `${label} must be a bare executable name, got ${value}`;
  }
  if (!allowed.includes(base)) {
    return `${label} must be one of ${allowed.join(", ")}, got ${value}`;
  }
  return undefined;
}

export function validateConfigSecurity(config: SoraneConfig): readonly ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const security = resolveSecurityConfig(config);

  for (const f of validateEmergencyBannerUrls(config.site)) {
    findings.push({ severity: "error", category: "link", message: f.message });
  }

  if (!security.allow_custom_binaries) {
    const checks: Array<[string, string | undefined, readonly string[]]> = [
      ["build.diagrams.d2.binary", config.build.diagrams?.d2?.binary, KNOWN_BINARIES.d2!],
      ["build.diagrams.graphviz.binary", config.build.diagrams?.graphviz?.binary, KNOWN_BINARIES.dot!],
      ["build.diagrams.mermaid.mmdc", config.build.diagrams?.mermaid?.mmdc, KNOWN_BINARIES.mmdc!],
      ["build.image_metadata.exiftool", config.build.image_metadata?.exiftool, KNOWN_BINARIES.exiftool!],
      ["build.c2pa.binary", config.build.c2pa?.binary, KNOWN_BINARIES.c2patool!],
    ];
    for (const [label, value, allowed] of checks) {
      const err = validateBinaryField(label, value, allowed);
      if (err) findings.push({ severity: "error", category: "okf", message: err });
    }
  }

  return findings;
}