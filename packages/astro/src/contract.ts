import type { DiagramsConfig, OkfConfig, RedirectRuleConfig, SoraneConfig } from "@sorane/core";
import type { SoraneAstroPermalink, SoraneAstroValidateMode } from "./options.ts";
import type { SoraneAstroSearchConfig } from "./search.ts";

export const SORANE_ASTRO_BACKEND_SCHEMA_VERSION = 1 as const;

export interface SoraneAstroBackendLocaleInput {
  readonly lang: string;
  readonly pathPrefix: string;
}

export interface SoraneAstroBackendSiteI18nInput {
  readonly default?: string;
  readonly locales?: Readonly<Record<string, SoraneAstroBackendLocaleInput>>;
}

export interface SoraneAstroBackendEmergencyLocaleInput {
  readonly message?: string;
  readonly href?: string;
}

export interface SoraneAstroBackendEmergencyInput {
  readonly message?: string;
  readonly href?: string;
  readonly locales?: Readonly<Record<string, SoraneAstroBackendEmergencyLocaleInput>>;
}

export interface SoraneAstroBackendSecurityInput {
  readonly redirectSameOrigin?: boolean;
  readonly allowCustomBinaries?: boolean;
}

export interface SoraneAstroBackendImageMetadataInput {
  readonly exiftool?: string;
}

export interface SoraneAstroBackendC2paInput {
  readonly binary?: string;
}

export interface SoraneAstroBackendFileInput {
  readonly relPath: string;
  readonly source: string;
}

export interface SoraneAstroBackendSiteInput {
  readonly title: string;
  readonly description: string;
  readonly baseUrl?: string;
  /** Primary site language (BCP 47). Default: `ja`. */
  readonly lang?: string;
  readonly i18n?: SoraneAstroBackendSiteI18nInput;
  readonly emergency?: SoraneAstroBackendEmergencyInput;
}

export interface SoraneAstroBackendOutputsInput {
  readonly catalog?: boolean;
  readonly llmsTxt?: boolean;
  readonly okfBundle?: boolean;
  readonly sitemap?: boolean;
  readonly dcatCatalog?: boolean;
  readonly search?: boolean;
}

export interface SoraneAstroBackendOpenDataInput {
  readonly dcatCatalog?: boolean;
  readonly defaultLicense?: string;
}

/** File-based input contract for OKF artifact backends (TS / WASM / CLI). */
export interface SoraneAstroBackendInput {
  readonly schema_version: typeof SORANE_ASTRO_BACKEND_SCHEMA_VERSION;
  readonly root: string;
  readonly contentDir: string;
  readonly outDir: string;
  readonly site: SoraneAstroBackendSiteInput;
  readonly files: readonly SoraneAstroBackendFileInput[];
  readonly permalink?: SoraneAstroPermalink;
  readonly collections?: Readonly<Record<string, string>>;
  readonly outputs?: SoraneAstroBackendOutputsInput;
  readonly validate?: SoraneAstroValidateMode;
  readonly quality?: SoraneConfig["build"]["quality"];
  readonly okf?: OkfConfig;
  readonly openData?: SoraneAstroBackendOpenDataInput;
  readonly diagrams?: DiagramsConfig;
  readonly redirects?: readonly RedirectRuleConfig[];
  readonly security?: SoraneAstroBackendSecurityInput;
  readonly search?: SoraneAstroSearchConfig;
  readonly imageMetadata?: SoraneAstroBackendImageMetadataInput;
  readonly c2pa?: SoraneAstroBackendC2paInput;
}

export type SoraneAstroArtifactKind = "text" | "base64";

export interface SoraneAstroBackendArtifact {
  readonly path: string;
  readonly kind: SoraneAstroArtifactKind;
  readonly content: string;
}

/** File-based output contract returned by OKF artifact backends. */
export interface SoraneAstroBackendOutput {
  readonly schema_version: typeof SORANE_ASTRO_BACKEND_SCHEMA_VERSION;
  readonly concepts: number;
  readonly validationErrors: number;
  readonly validationWarnings: number;
  readonly validationDetails: readonly string[];
  readonly artifacts: readonly SoraneAstroBackendArtifact[];
}