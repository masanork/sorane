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

export type DocsNavSpec = string | { readonly href: string; readonly title?: string };

export interface DocsConfig {
  /** ドキュメントサイトのサイドバー順（href は dist 基準、例: getting-started.html） */
  readonly nav?: readonly DocsNavSpec[];
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

export interface SoraneConfig {
  readonly site: {
    readonly title: string;
    readonly description: string;
    readonly base_url: string;
    readonly lang: string;
  };
  readonly build: {
    readonly content_dir: string;
    readonly out_dir: string;
    readonly permalink: string;
    /** 存在すれば out_dir へ再帰コピーする静的資産ディレクトリ（例: static/）。 */
    readonly static_dir?: string;
    readonly blog?: BlogBuildConfig;
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
      archives: true,
      tags: true,
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

export function mergeConfig(partial: Partial<SoraneConfig>): SoraneConfig {
  return {
    site: { ...DEFAULT_CONFIG.site, ...partial.site },
    build: {
      ...DEFAULT_CONFIG.build,
      ...partial.build,
      blog: { ...DEFAULT_CONFIG.build.blog, ...partial.build?.blog },
    },
    fonts: { ...DEFAULT_CONFIG.fonts, ...partial.fonts },
    search: { ...DEFAULT_CONFIG.search, ...partial.search },
    docs: partial.docs ? { nav: partial.docs.nav } : undefined,
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