export interface FontConfigInput {
  readonly enabled?: boolean;
  readonly family?: string;
  readonly source?: string;
  readonly cache_dir?: string;
  readonly weight?: string;
  readonly skip_key?: string;
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
  };
  readonly fonts: {
    readonly enabled: boolean;
    readonly family: string;
    readonly source: string;
    readonly cache_dir: string;
    readonly weight: string;
    readonly skip_key: string;
  };
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
  },
  fonts: {
    enabled: false,
    family: "Sorane-Subset",
    source: "assets/fonts/source.ttf",
    cache_dir: ".sorane/cache/fonts",
    weight: "450",
    skip_key: "noFontEmbedding",
  },
};

export function mergeConfig(partial: Partial<SoraneConfig>): SoraneConfig {
  return {
    site: { ...DEFAULT_CONFIG.site, ...partial.site },
    build: { ...DEFAULT_CONFIG.build, ...partial.build },
    fonts: { ...DEFAULT_CONFIG.fonts, ...partial.fonts },
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