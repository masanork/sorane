import type { DiagramsConfig, OkfConfig, RedirectRuleConfig, SoraneConfig } from "@sorane/core";
import type {
  SoraneAstroBackendSecurityInput,
  SoraneAstroBackendSiteI18nInput,
} from "./contract.ts";
import type { SoraneAstroSearchConfig } from "./search.ts";
import type { SoraneAstroBackend } from "./backend.ts";

export type SoraneAstroPermalink = "html" | "directory";
export type SoraneAstroValidateMode = false | "warn" | "error";

export type AstroLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

export interface SoraneAstroSiteConfig {
  readonly title: string;
  readonly description: string;
  readonly baseUrl?: string;
  /** Primary site language (BCP 47). Default: `ja`. */
  readonly lang?: string;
  readonly i18n?: SoraneAstroBackendSiteI18nInput;
}

export interface SoraneAstroOptions {
  /** Astro project root. The integration fills this from Astro when omitted. */
  readonly root?: string;
  /** Markdown/MDX source root, relative to root. Default: src/content. */
  readonly contentDir?: string;
  /** Astro build output directory. The integration fills this from Astro when omitted. */
  readonly outDir?: string;
  readonly site: SoraneAstroSiteConfig;
  /**
   * URL style for inferred content URLs.
   * `directory`: blog/post.md -> blog/post/index.html
   * `html`: blog/post.md -> blog/post.html
   */
  readonly permalink?: SoraneAstroPermalink;
  /**
   * Collection-to-route mapping. Example: { posts: "blog" } makes
   * src/content/posts/hello.md publish as blog/hello.html.
   */
  readonly collections?: Readonly<Record<string, string>>;
  readonly outputs?: {
    readonly catalog?: boolean;
    readonly llmsTxt?: boolean;
    readonly okfBundle?: boolean;
    readonly sitemap?: boolean;
    readonly dcatCatalog?: boolean;
    readonly search?: boolean;
  };
  /** Open data options (DCAT catalog emission). */
  readonly openData?: {
    readonly dcatCatalog?: boolean;
    readonly defaultLicense?: string;
  };
  /** Search index + web assets (`assets/search-index.json`). Requires `@sorane/search`. */
  readonly search?: SoraneAstroSearchConfig;
  /** Validate OKF frontmatter while emitting artifacts. Default: "warn". */
  readonly validate?: SoraneAstroValidateMode;
  /** Quality gates aligned with `sorane validate` (heading, diagram alt, links, …). */
  readonly quality?: SoraneConfig["build"]["quality"];
  /** OKF profile defaults passed through to site validation. */
  readonly okf?: OkfConfig;
  /** Diagram fences (alt gates when `enabled: true`). */
  readonly diagrams?: DiagramsConfig;
  /** sorane.yaml `build.redirects` parity for validation. */
  readonly redirects?: readonly RedirectRuleConfig[];
  /** Security options passed through to validation. */
  readonly security?: SoraneAstroBackendSecurityInput;
  /** Artifact backend. `auto` prefers native Rust CLI when built, then inline `ts`. */
  readonly backend?: SoraneAstroBackend;
  readonly logger?: AstroLogger;
}

export interface SoraneAstroArtifactResult {
  readonly concepts: number;
  readonly files: readonly string[];
  readonly validationErrors: number;
  readonly validationWarnings: number;
}