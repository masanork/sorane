export interface FontSourceSpec {
  readonly source: string;
  readonly weight?: string;
  readonly embed?: "subset" | "static";
}

export interface FontRoles {
  readonly body: readonly string[];
  readonly heading?: readonly string[];
  readonly code?: readonly string[];
}

export type FeaturedMode = "excerpt" | "full" | "off";

export interface BlogBuildConfig {
  /** 1ページあたりの記事数（page/N.html） */
  readonly page_size?: number;
  /** トップ index のアーカイブ欄に載せる件数（既定 15） */
  readonly index_archive_limit?: number;
  /** トップの最新記事表示: excerpt | full | off */
  readonly featured_mode?: FeaturedMode;
  /** featured_mode: excerpt の最大文字数 */
  readonly excerpt_length?: number;
  /** アーカイブリストに description を出す */
  readonly show_list_descriptions?: boolean;
  /** archive/index.html, archive/YYYY.html 等を生成 */
  readonly archives?: boolean;
  /** tag/slug.html を生成 */
  readonly tags?: boolean;
}

export type SearchMode = "fts" | "hybrid";

export interface SearchConfig {
  /** fts（標準）| hybrid（experimental・要埋め込みモデル） */
  readonly mode?: SearchMode;
  /** FTS インデックスの出力先（既定: .sorane/index.db） */
  readonly index?: string;
  /** 埋め込みモデル root（既定: vendor/models） */
  readonly model?: string;
  /** モデル ID（既定: ruri-v3-30m） */
  readonly model_id?: string;
  /** 大容量検索資産の配信元（R2 等）。末尾 "/" 推奨。空なら同一オリジン。 */
  readonly asset_base_url?: string;
  /** dist に ONNX モデルを同梱する（Pages 25MiB 制限のため本番では false 推奨） */
  readonly bundle_model?: boolean;
}

export type DocsNavSpec =
  | string
  | { readonly href: string; readonly title?: string }
  | { readonly section: string };

export type DocsIndexLayout = "landing" | "hub";

export interface DocsConfig {
  /** ドキュメントサイトのサイドバー順（href は dist 基準、例: getting-started.html） */
  readonly nav?: readonly DocsNavSpec[];
  /**
   * トップ（index）のレイアウト。
   * - `landing`: 製品の顔としてシンプル（サイドバーなし・ドキュメント一覧なし）
   * - `hub`: サイドバー + ニュース + ドキュメント一覧（従来）
   */
  readonly index_layout?: DocsIndexLayout;
}

export type MermaidMode = "client" | "build" | "off";

export interface DiagramsConfig {
  readonly enabled?: boolean;
  readonly mermaid?: {
    readonly mode?: MermaidMode;
    readonly version?: string;
    readonly mmdc?: string;
  };
  readonly d2?: {
    readonly enabled?: boolean;
    readonly binary?: string;
  };
  readonly graphviz?: {
    readonly enabled?: boolean;
    readonly binary?: string;
  };
  /** PlantUML via Kroki HTTP (network dependency; default off). */
  readonly plantuml?: {
    readonly enabled?: boolean;
    /** Kroki base URL (no trailing slash). Default `https://kroki.io`. */
    readonly kroki_url?: string;
  };
}

export const DEFAULT_DIAGRAMS_CONFIG: Required<DiagramsConfig> = {
  enabled: false,
  mermaid: { mode: "client", version: "~11.15.0", mmdc: "mmdc" },
  d2: { enabled: false, binary: "d2" },
  graphviz: { enabled: false, binary: "dot" },
  plantuml: { enabled: false, kroki_url: "https://kroki.io" },
};

import type { BuildOutputsConfig, PresetLayer } from "./presets.ts";

export type { BuildOutputsConfig, SoranePreset } from "./presets.ts";

export interface ImageMetadataConfig {
  readonly enabled?: boolean;
  readonly exiftool?: string;
  /** 既定: content/asset-provenance.yaml */
  readonly manifest?: string;
}

export interface C2paConfig {
  readonly enabled?: boolean;
  /** 既定 true（埋め込み）。false は sidecar .c2pa（開発用） */
  readonly embed?: boolean;
  readonly binary?: string;
  readonly certificate_path?: string;
  readonly private_key_path?: string;
  readonly settings_path?: string;
}

export type QualityGateSeverity = "warn" | "error";

export type CspProfile = "standard" | "strict";

export interface SecurityConfig {
  /** iframe/embed/object を HTML から除外（gov 既定: true） */
  readonly strict_html?: boolean;
  /** レガシー HTML の埋め込みを許可（strict_html が false のときのみ有効） */
  readonly allow_embeds?: boolean;
  /** search-index.json に chunk 全文を含めない */
  readonly search_snippet_only?: boolean;
  /** リダイレクト先を site.base_url と同一オリジンに限定 */
  readonly redirect_same_origin?: boolean;
  /** sorane.yaml で外部バイナリパスを上書き可能 */
  readonly allow_custom_binaries?: boolean;
  /** dist/_headers に CSP 等を出力 */
  readonly emit_security_headers?: boolean;
  /** CSP 厳格度 */
  readonly csp_profile?: CspProfile;
  /** Markdown / HTML 内リンクのスキーム検査 */
  readonly link_scheme_check?: boolean | QualityGateSeverity;
}

export const DEFAULT_SECURITY_CONFIG: Required<SecurityConfig> = {
  strict_html: true,
  allow_embeds: false,
  search_snippet_only: false,
  redirect_same_origin: false,
  allow_custom_binaries: true,
  emit_security_headers: true,
  csp_profile: "standard",
  link_scheme_check: "warn",
};

export function resolveSecurityConfig(
  config: Pick<SoraneConfig, "build">,
): Required<SecurityConfig> {
  const raw = config.build.security ?? {};
  const strictHtml = raw.strict_html ?? DEFAULT_SECURITY_CONFIG.strict_html;
  const allowEmbeds = raw.allow_embeds ?? DEFAULT_SECURITY_CONFIG.allow_embeds;
  return {
    strict_html: strictHtml,
    allow_embeds: allowEmbeds && !strictHtml,
    search_snippet_only: raw.search_snippet_only ?? DEFAULT_SECURITY_CONFIG.search_snippet_only,
    redirect_same_origin:
      raw.redirect_same_origin ?? DEFAULT_SECURITY_CONFIG.redirect_same_origin,
    allow_custom_binaries:
      raw.allow_custom_binaries ?? DEFAULT_SECURITY_CONFIG.allow_custom_binaries,
    emit_security_headers:
      raw.emit_security_headers ?? DEFAULT_SECURITY_CONFIG.emit_security_headers,
    csp_profile: raw.csp_profile ?? DEFAULT_SECURITY_CONFIG.csp_profile,
    link_scheme_check: raw.link_scheme_check ?? DEFAULT_SECURITY_CONFIG.link_scheme_check,
  };
}

export interface QualityGateConfig {
  /** 本文画像の alt 欠落（既定: true） */
  readonly image_alt?: boolean;
  /** 非説明的リンクテキスト（既定: true） */
  readonly link_text?: boolean;
  /** GFM 表のヘッダー行・区切り行（既定: true） */
  readonly table_headers?: boolean;
  /** timestamp / updated の形式・順序（既定: true） */
  readonly dates?: boolean;
  /** 見出し階層（既定: warn）。`error` で validate が失敗、`false` で無効 */
  readonly heading?: boolean | QualityGateSeverity;
  /** 本文の言語混在・`lang` 属性（既定: true） */
  readonly lang_mixing?: boolean;
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

export interface FontConfigInput {
  readonly enabled?: boolean;
  readonly family?: string;
  readonly source?: string;
  readonly cache_dir?: string;
  readonly weight?: string;
  readonly skip_key?: string;
  readonly roles?: FontRoles;
  readonly sources?: Readonly<Record<string, FontSourceSpec>>;
}

import type {
  SiteContactConfig,
  SiteFindabilityConfig,
  SiteOrganizationConfig,
} from "./findability.ts";
import type { SiteI18nConfig } from "./i18n.ts";
import type { SiteEmergencyConfig } from "./emergency-banner.ts";
import type { SiteHostingConfig } from "./hosting-cloudflare.ts";

export type {
  OrganizationKind,
  SiteContactConfig,
  SiteFindabilityConfig,
  SiteOrganizationConfig,
} from "./findability.ts";
export type { LocaleConfig, SiteI18nConfig } from "./i18n.ts";
export type {
  EmergencyMessageSpec,
  EmergencySeverity,
  SiteEmergencyConfig,
} from "./emergency-banner.ts";
export type { RevisionEntry } from "./revision-history.ts";
export type {
  SiteHostingConfig,
  SiteHostingCloudflareConfig,
  SiteHostingLogpushConfig,
} from "./hosting-cloudflare.ts";

import type { OkfConfig } from "./okf-config.ts";

export type { OkfConfig, UnknownTypePolicy } from "./okf-config.ts";

export interface SiteOpenDataConfig {
  /** Emit `dist/catalog-dcat.jsonld` (DCAT-AP JSON-LD for `type: dataset` only). */
  readonly dcat_catalog?: boolean;
  /** Fallback `dct:license` when a dataset omits `license`. */
  readonly default_license?: string;
}

export interface RedirectRuleConfig {
  /** 旧 URL パス（`/old.html` または `old.html`）。ホスト付き URL も可（Cloudflare Pages `_redirects`）。 */
  readonly from: string;
  /** 転送先（絶対 URL または `/new.html`）。 */
  readonly to: string;
  /** HTTP ステータス（既定 301）。301 / 302 / 303 / 307 / 308。 */
  readonly status?: number;
}

export interface SoraneConfig {
  readonly site: {
    readonly title: string;
    readonly description: string;
    readonly base_url: string;
    readonly lang: string;
    /** 既定の OGP 画像（絶対 URL またはサイトルート相対パス。要 base_url） */
    readonly og_image?: string;
    /** 発行主体（GovernmentOrganization 等）。JSON-LD / catalog / llms.txt に反映 */
    readonly organization?: SiteOrganizationConfig;
    readonly contact?: SiteContactConfig;
    readonly findability?: SiteFindabilityConfig;
    /** 多言語（hreflang）。`locales` があるときのみ有効 */
    readonly i18n?: SiteI18nConfig;
    /** 全ページ上部の緊急告知バナー */
    readonly emergency?: SiteEmergencyConfig;
    /** ホスティング連携（Cloudflare Logpush 等） */
    readonly hosting?: SiteHostingConfig;
    /** オープンデータ出力（DCAT-AP カタログ等） */
    readonly open_data?: SiteOpenDataConfig;
    /** サイト全体のコンテンツライセンス（SPDX id または HTTPS URI）。フッター・JSON-LD・llms.txt に反映。 */
    readonly license?: string;
    /** ライセンス説明ページ（dist 相対、例: `license.html`）。未設定時は `license` の URI へリンク。 */
    readonly license_page?: string;
    /** フッターの著作権表示（`copyright_since` / `copyright_holder` より優先）。 */
    readonly copyright?: string;
    /** 初出年。ビルド年と異なれば `2023–2026` のように範囲化（`copyright` 未設定時）。 */
    readonly copyright_since?: number;
    /** 著作権者名（`copyright` 未設定時は `copyright_since` と組み合わせ）。 */
    readonly copyright_holder?: string;
  };
  readonly build: {
    readonly content_dir: string;
    readonly out_dir: string;
    readonly permalink: string;
    /** 存在すれば out_dir へ再帰コピーする静的資産ディレクトリ（例: static/）。 */
    readonly static_dir?: string;
    readonly blog?: BlogBuildConfig;
    readonly ai_disclosure?: AiDisclosureConfig;
    readonly diagrams?: DiagramsConfig;
    readonly image_metadata?: ImageMetadataConfig;
    readonly c2pa?: C2paConfig;
    /** `validate` の公的品質ゲート（warning のみ、ビルドは継続） */
    readonly quality?: QualityGateConfig;
    /** 機械可読・フィード等の出力（`preset` と併用可） */
    readonly outputs?: BuildOutputsConfig;
    /**
     * サイト移行用リダイレクト。ビルド時に `dist/_redirects`（Cloudflare Pages / Netlify 形式）を出力する。
     * 記事 frontmatter の `redirect` と併用可（同一 `from` は後勝ち）。
     */
    readonly redirects?: readonly RedirectRuleConfig[];
    readonly security?: SecurityConfig;
  };
  readonly fonts: {
    readonly enabled: boolean;
    readonly cache_dir: string;
    readonly skip_key: string;
    readonly family?: string;
    readonly source?: string;
    readonly weight?: string;
    readonly roles?: FontRoles;
    readonly sources?: Readonly<Record<string, FontSourceSpec>>;
  };
  readonly search: SearchConfig & {
    readonly mode: SearchMode;
    readonly index: string;
    readonly model: string;
    readonly model_id: string;
    readonly asset_base_url: string;
  };
  readonly docs?: DocsConfig;
  /** OKF プロファイル既定・未知 type ポリシー */
  readonly okf?: OkfConfig;
}

export const DEFAULT_CONFIG: SoraneConfig = {
  site: {
    title: "Sorane Site",
    description: "OKF-native static site",
    base_url: "",
    lang: "ja",
  },
  build: {
    content_dir: "content",
    out_dir: "dist",
    permalink: "{{slug}}.html",
    blog: {
      page_size: 50,
      index_archive_limit: 15,
      featured_mode: "excerpt",
      excerpt_length: 400,
      show_list_descriptions: false,
      archives: false,
      tags: false,
    },
    ai_disclosure: {},
    diagrams: DEFAULT_DIAGRAMS_CONFIG,
    image_metadata: {},
    c2pa: { enabled: false, embed: true, binary: "c2patool" },
    quality: {},
    security: {},
    outputs: {
      md_alternate: false,
      okf_bundle: false,
      catalog: false,
      llms_txt: false,
      feed: true,
      sitemap: true,
      robots: true,
    },
  },
  fonts: {
    enabled: false,
    family: "Sorane-Subset",
    source: "assets/fonts/source.ttf",
    cache_dir: ".sorane/cache/fonts",
    weight: "450",
    skip_key: "noFontEmbedding",
  },
  search: {
    mode: "fts",
    index: ".sorane/index.db",
    model: "vendor/models",
    model_id: "ruri-v3-30m",
    asset_base_url: "",
    bundle_model: true,
  },
};

import {
  mergeOutputsConfig,
  presetPartial,
  type SoranePreset,
} from "./presets.ts";

export type MergeConfigInput = Partial<SoraneConfig> & { readonly preset?: SoranePreset };

export function mergeConfig(partial: MergeConfigInput = {}): SoraneConfig {
  const { preset, ...rest } = partial;
  const presetLayer: PresetLayer = preset ? presetPartial(preset) : {};
  const site = { ...DEFAULT_CONFIG.site, ...rest.site };
  const buildPartial = { ...presetLayer.build, ...rest.build };
  return {
    site,
    build: {
      ...DEFAULT_CONFIG.build,
      ...buildPartial,
      blog: {
        ...DEFAULT_CONFIG.build.blog,
        ...presetLayer.build?.blog,
        ...rest.build?.blog,
      },
      ai_disclosure: buildPartial.ai_disclosure
        ? { ...DEFAULT_CONFIG.build.ai_disclosure, ...buildPartial.ai_disclosure }
        : DEFAULT_CONFIG.build.ai_disclosure,
      diagrams: buildPartial.diagrams
        ? {
            ...DEFAULT_DIAGRAMS_CONFIG,
            ...buildPartial.diagrams,
            mermaid: {
              ...DEFAULT_DIAGRAMS_CONFIG.mermaid,
              ...buildPartial.diagrams.mermaid,
            },
            d2: {
              ...DEFAULT_DIAGRAMS_CONFIG.d2,
              ...buildPartial.diagrams.d2,
            },
            graphviz: {
              ...DEFAULT_DIAGRAMS_CONFIG.graphviz,
              ...buildPartial.diagrams.graphviz,
            },
            plantuml: {
              ...DEFAULT_DIAGRAMS_CONFIG.plantuml,
              ...buildPartial.diagrams.plantuml,
            },
          }
        : DEFAULT_DIAGRAMS_CONFIG,
      image_metadata: buildPartial.image_metadata
        ? { ...DEFAULT_CONFIG.build.image_metadata, ...buildPartial.image_metadata }
        : DEFAULT_CONFIG.build.image_metadata,
      c2pa: buildPartial.c2pa
        ? { ...DEFAULT_CONFIG.build.c2pa, ...buildPartial.c2pa }
        : DEFAULT_CONFIG.build.c2pa,
      quality: buildPartial.quality
        ? { ...DEFAULT_CONFIG.build.quality, ...buildPartial.quality }
        : DEFAULT_CONFIG.build.quality,
      security: buildPartial.security
        ? { ...DEFAULT_CONFIG.build.security, ...buildPartial.security }
        : DEFAULT_CONFIG.build.security,
      outputs: mergeOutputsConfig(
        mergeOutputsConfig(DEFAULT_CONFIG.build.outputs, presetLayer.build?.outputs),
        rest.build?.outputs,
      ),
    },
    fonts: { ...DEFAULT_CONFIG.fonts, ...rest.fonts },
    search: { ...DEFAULT_CONFIG.search, ...rest.search },
    docs: rest.docs
      ? {
          nav: rest.docs.nav,
          ...(rest.docs.index_layout ? { index_layout: rest.docs.index_layout } : {}),
        }
      : undefined,
    okf: rest.okf,
  };
}



/** permalink テンプレートから出力 HTML ファイル名を決める。 */
export function resolvePermalink(
  template: string,
  slug: string,
  timestamp?: string,
): string {
  const date = timestamp?.slice(0, 10) ?? "";
  return template
    .replace(/\{\{slug\}\}/g, slug)
    .replace(/\{\{date\}\}/g, date);
}