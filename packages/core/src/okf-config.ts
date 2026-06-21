import type { ValidateOptions, UnknownTypePolicy } from "@sorane/okf";
import { SUPPORTED_PROFILE_RE } from "@sorane/okf";
import type { SoraneConfig } from "./config.ts";

export type { UnknownTypePolicy };

export interface OkfConfig {
  /** Frontmatter に `profile` が無いときの既定（例: sorane-okf/0.3） */
  readonly default_profile?: string;
  /** 0.3 の未知 `type` 扱い（既定: warn） */
  readonly unknown_type?: UnknownTypePolicy;
}

export function normalizeOkfConfig(raw: OkfConfig | undefined): OkfConfig | undefined {
  if (!raw) return undefined;
  if (raw.default_profile !== undefined && !SUPPORTED_PROFILE_RE.test(raw.default_profile)) {
    throw new Error(
      `okf.default_profile must match sorane-okf/0.1, sorane-okf/0.2, or sorane-okf/0.3`,
    );
  }
  if (
    raw.unknown_type !== undefined &&
    raw.unknown_type !== "warn" &&
    raw.unknown_type !== "error"
  ) {
    throw new Error(`okf.unknown_type must be "warn" or "error"`);
  }
  return raw;
}

export function okfValidateOptions(config: SoraneConfig): ValidateOptions | undefined {
  const okf = config.okf;
  if (!okf) return undefined;
  return {
    defaultProfile: okf.default_profile,
    unknownType: okf.unknown_type ?? "warn",
  };
}