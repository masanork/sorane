/** ビルド成果物の出力制御（未指定は軽量既定）。 */
export interface BuildOutputsConfig {
  readonly md_alternate?: boolean;
  readonly okf_bundle?: boolean;
  readonly catalog?: boolean;
  readonly llms_txt?: boolean;
  readonly feed?: boolean;
  readonly sitemap?: boolean;
  readonly robots?: boolean;
}

/** サイト構成プリセット。`sorane.yaml` の `preset:` で指定。 */
export type SoranePreset = "blog" | "okf-site" | "gov";

export interface ResolvedBuildOutputs {
  readonly md_alternate: boolean;
  readonly okf_bundle: boolean;
  readonly catalog: boolean;
  readonly llms_txt: boolean;
  readonly feed: boolean;
  readonly sitemap: boolean;
  readonly robots: boolean;
}

export const LITE_OUTPUTS: ResolvedBuildOutputs = {
  md_alternate: false,
  okf_bundle: false,
  catalog: false,
  llms_txt: false,
  feed: true,
  sitemap: true,
  robots: true,
};

export const OKF_SITE_OUTPUTS: ResolvedBuildOutputs = {
  md_alternate: true,
  okf_bundle: true,
  catalog: true,
  llms_txt: true,
  feed: true,
  sitemap: true,
  robots: true,
};

/** `mergeConfig({ preset })` に渡す部分設定（循環 import 回避のため疎型）。 */
export interface PresetLayer {
  readonly build?: {
    readonly blog?: {
      readonly archives?: boolean;
      readonly tags?: boolean;
    };
    readonly diagrams?: {
      readonly enabled?: boolean;
      readonly mermaid?: { readonly mode?: "client" | "build" | "off" };
      readonly d2?: { readonly enabled?: boolean };
      readonly graphviz?: { readonly enabled?: boolean };
      readonly plantuml?: {
        readonly enabled?: boolean;
        readonly kroki_url?: string;
      };
    };
    readonly quality?: Record<string, unknown>;
    readonly security?: Record<string, unknown>;
    readonly outputs?: BuildOutputsConfig;
  };
}

const PRESET_PARTIALS: Record<SoranePreset, PresetLayer> = {
  blog: {
    build: {
      blog: { archives: false, tags: false },
      diagrams: { enabled: false },
      outputs: { ...LITE_OUTPUTS },
    },
  },
  "okf-site": {
    build: {
      blog: { archives: true, tags: true },
      diagrams: { enabled: true },
      outputs: { ...OKF_SITE_OUTPUTS },
    },
  },
  gov: {
    build: {
      blog: { archives: true, tags: true },
      diagrams: {
        enabled: true,
        mermaid: { mode: "build" },
      },
      quality: {
        image_alt: true,
        link_text: true,
        table_headers: true,
        dates: true,
        heading: "error",
        lang_mixing: true,
      },
      security: {
        strict_html: true,
        allow_embeds: false,
        search_snippet_only: true,
        redirect_same_origin: true,
        allow_custom_binaries: false,
        emit_security_headers: true,
        csp_profile: "strict",
        link_scheme_check: "error",
      },
      outputs: { ...OKF_SITE_OUTPUTS },
    },
  },
};

export function presetPartial(preset: SoranePreset): PresetLayer {
  return PRESET_PARTIALS[preset];
}

export function resolveBuildOutputs(outputs?: BuildOutputsConfig): ResolvedBuildOutputs {
  const base = { ...LITE_OUTPUTS };
  if (!outputs) return base;
  return {
    md_alternate: outputs.md_alternate ?? base.md_alternate,
    okf_bundle: outputs.okf_bundle ?? base.okf_bundle,
    catalog: outputs.catalog ?? base.catalog,
    llms_txt: outputs.llms_txt ?? base.llms_txt,
    feed: outputs.feed ?? base.feed,
    sitemap: outputs.sitemap ?? base.sitemap,
    robots: outputs.robots ?? base.robots,
  };
}

export function mergeOutputsConfig(
  base: BuildOutputsConfig | undefined,
  overlay: BuildOutputsConfig | undefined,
): BuildOutputsConfig | undefined {
  if (!base && !overlay) return undefined;
  return { ...base, ...overlay };
}