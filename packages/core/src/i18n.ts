import type { ParsedConcept } from "@sorane/okf";
import { resolvePermalink, type SoraneConfig } from "./config.ts";
import { escapeHtml } from "./render.ts";
import { ogLocaleFromLang } from "./og-meta.ts";

export interface LocaleConfig {
  readonly lang: string;
  /** dist 配下の URL プレフィックス（スラッシュなし）。例: `en` → `en/about.html` */
  readonly path_prefix: string;
}

export interface SiteI18nConfig {
  /** 既定ロケールの BCP 47 タグ。省略時は `site.lang` */
  readonly default?: string;
  readonly locales?: Readonly<Record<string, LocaleConfig>>;
}

export interface I18nContext {
  readonly enabled: boolean;
  readonly defaultLang: string;
  readonly locales: Readonly<Record<string, LocaleConfig>>;
  /** path_prefix → locale id */
  readonly prefixToLocale: ReadonlyMap<string, string>;
}

export interface PageLocaleInfo {
  readonly localeId: string;
  readonly lang: string;
  readonly pathPrefix: string;
  readonly logicalRelPath: string;
  readonly outRel: string;
}

export interface HreflangAlternate {
  readonly hreflang: string;
  readonly href: string;
}

const DEFAULT_LOCALE_ID = "default";

function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

function slugFromLogicalPath(logicalRelPath: string): string {
  const base = logicalRelPath.split("/").pop() ?? logicalRelPath;
  return base.replace(/\.md$/i, "");
}

/** sorane.yaml の `site.i18n` を正規化する。ロケール無しなら disabled。 */
export function resolveI18nContext(site: SoraneConfig["site"]): I18nContext {
  const raw = site.i18n?.locales;
  if (!raw || Object.keys(raw).length === 0) {
    return {
      enabled: false,
      defaultLang: site.lang,
      locales: {},
      prefixToLocale: new Map(),
    };
  }

  const locales: Record<string, LocaleConfig> = {};
  const prefixToLocale = new Map<string, string>();

  for (const [id, spec] of Object.entries(raw)) {
    const prefix = spec.path_prefix?.trim();
    if (!prefix || prefix.includes("/")) {
      throw new Error(
        `site.i18n.locales.${id}.path_prefix must be a non-empty single path segment`,
      );
    }
    if (prefixToLocale.has(prefix)) {
      throw new Error(`duplicate site.i18n path_prefix: ${prefix}`);
    }
    const lang = spec.lang?.trim();
    if (!lang) {
      throw new Error(`site.i18n.locales.${id}.lang is required`);
    }
    locales[id] = { lang, path_prefix: prefix };
    prefixToLocale.set(prefix, id);
  }

  const defaultLang = site.i18n?.default?.trim() || site.lang;
  return { enabled: true, defaultLang, locales, prefixToLocale };
}

/** コンテンツ相対パスからロケール ID を推定する（既定は `default`）。 */
export function localeIdFromRelPath(relPath: string, ctx: I18nContext): string {
  if (!ctx.enabled) return DEFAULT_LOCALE_ID;
  const norm = normalizeRel(relPath);
  const first = norm.split("/")[0];
  if (!first) return DEFAULT_LOCALE_ID;
  return ctx.prefixToLocale.get(first) ?? DEFAULT_LOCALE_ID;
}

/** ロケール接頭辞を除いた論理パス（`en/about.md` → `about.md`）。 */
export function logicalRelPath(relPath: string, ctx: I18nContext): string {
  const norm = normalizeRel(relPath);
  if (!ctx.enabled) return norm;
  const localeId = localeIdFromRelPath(norm, ctx);
  if (localeId === DEFAULT_LOCALE_ID) return norm;
  const prefix = ctx.locales[localeId]!.path_prefix;
  if (norm === prefix) return "index.md";
  if (norm.startsWith(`${prefix}/`)) return norm.slice(prefix.length + 1);
  return norm;
}

export function langForLocale(localeId: string, ctx: I18nContext): string {
  if (localeId === DEFAULT_LOCALE_ID) return ctx.defaultLang;
  return ctx.locales[localeId]?.lang ?? ctx.defaultLang;
}

function outRelFromLogical(
  logical: string,
  concept: ParsedConcept["concept"],
  permalink: string,
  pathPrefix: string,
): string {
  const slug = slugFromLogicalPath(logical);
  const base =
    concept.type === "index" || slug === "index"
      ? "index.html"
      : resolvePermalink(permalink, slug, concept.timestamp);
  if (!pathPrefix) return base;
  return `${pathPrefix}/${base}`;
}

/** 1 ページ分の出力パス・言語・ロケール情報。 */
export function resolvePageLocaleInfo(
  p: ParsedConcept,
  config: SoraneConfig,
  ctx: I18nContext,
): PageLocaleInfo {
  const localeId = localeIdFromRelPath(p.relPath, ctx);
  const logical = logicalRelPath(p.relPath, ctx);
  const pathPrefix =
    localeId === DEFAULT_LOCALE_ID ? "" : ctx.locales[localeId]!.path_prefix;
  const lang =
    typeof p.concept.frontmatter.lang === "string" && p.concept.frontmatter.lang.length > 0
      ? p.concept.frontmatter.lang
      : langForLocale(localeId, ctx);
  const outRel = outRelFromLogical(
    logical,
    p.concept,
    config.build.permalink,
    pathPrefix,
  );
  return { localeId, lang, pathPrefix, logicalRelPath: logical, outRel };
}

/** 翻訳グループキー（`translation_key` または論理パス）。 */
export function translationGroupKey(
  p: ParsedConcept,
  ctx: I18nContext,
): string {
  const key = p.concept.frontmatter.translation_key;
  if (typeof key === "string" && key.trim().length > 0) {
    return `key:${key.trim()}`;
  }
  const logical = logicalRelPath(p.relPath, ctx);
  return `path:${logical.replace(/\.md$/i, "")}`;
}

export interface TranslationEntry {
  readonly parsed: ParsedConcept;
  readonly outRel: string;
  readonly lang: string;
  readonly localeId: string;
}

/** 翻訳グループ → ロケール別エントリ。 */
export function buildTranslationMap(
  parsed: readonly ParsedConcept[],
  config: SoraneConfig,
  ctx: I18nContext,
): Map<string, Map<string, TranslationEntry>> {
  const map = new Map<string, Map<string, TranslationEntry>>();
  for (const p of parsed) {
    const info = resolvePageLocaleInfo(p, config, ctx);
    const group = translationGroupKey(p, ctx);
    let byLocale = map.get(group);
    if (!byLocale) {
      byLocale = new Map();
      map.set(group, byLocale);
    }
    byLocale.set(info.localeId, {
      parsed: p,
      outRel: info.outRel,
      lang: info.lang,
      localeId: info.localeId,
    });
  }
  return map;
}

function absolutePageUrl(baseUrl: string, outRel: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/${outRel}`;
}

/** 現ページ向け hreflang / x-default リンク。base_url 無し・単言語なら空。 */
export function hreflangAlternatesForPage(
  groupKey: string,
  currentLocaleId: string,
  translationMap: Map<string, Map<string, TranslationEntry>>,
  baseUrl: string,
  ctx: I18nContext,
): readonly HreflangAlternate[] {
  if (!ctx.enabled || baseUrl.length === 0) return [];
  const group = translationMap.get(groupKey);
  if (!group || group.size < 2) return [];

  const alternates: HreflangAlternate[] = [];
  for (const entry of group.values()) {
    alternates.push({
      hreflang: entry.lang,
      href: absolutePageUrl(baseUrl, entry.outRel),
    });
  }

  const defaultEntry = group.get(DEFAULT_LOCALE_ID);
  if (defaultEntry) {
    alternates.push({
      hreflang: "x-default",
      href: absolutePageUrl(baseUrl, defaultEntry.outRel),
    });
  }

  alternates.sort((a, b) => {
    if (a.hreflang === "x-default") return 1;
    if (b.hreflang === "x-default") return -1;
    return a.hreflang.localeCompare(b.hreflang);
  });
  return alternates;
}

/** `<head>` 用 hreflang `<link>` タグ。 */
export function hreflangHeadTags(alternates: readonly HreflangAlternate[]): string[] {
  return alternates.map(
    (a) =>
      `<link rel="alternate" hreflang="${escapeHtml(a.hreflang)}" href="${escapeHtml(a.href)}">`,
  );
}

/** 他ロケール向け `og:locale:alternate` 値。 */
export function ogLocaleAlternatesForPage(
  groupKey: string,
  currentLang: string,
  translationMap: Map<string, Map<string, TranslationEntry>>,
  ctx: I18nContext,
): readonly string[] {
  if (!ctx.enabled) return [];
  const group = translationMap.get(groupKey);
  if (!group || group.size < 2) return [];
  const out: string[] = [];
  for (const entry of group.values()) {
    if (entry.lang === currentLang) continue;
    out.push(ogLocaleFromLang(entry.lang));
  }
  return [...new Set(out)].sort();
}