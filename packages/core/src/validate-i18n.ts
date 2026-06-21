import { parseConcept } from "@sorane/okf";
import type { SoraneConfig } from "./config.ts";
import {
  localeIdFromRelPath,
  logicalRelPath,
  resolveI18nContext,
  translationGroupKey,
  type I18nContext,
} from "./i18n.ts";

const DEFAULT_LOCALE_ID = "default";

export interface I18nValidateWarning {
  readonly message: string;
}

function translationKeyFromFrontmatter(
  frontmatter: Record<string, unknown>,
): string | undefined {
  const key = frontmatter.translation_key;
  if (typeof key !== "string") return undefined;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function addWarning(
  byFile: Map<string, I18nValidateWarning[]>,
  rel: string,
  message: string,
): void {
  const list = byFile.get(rel) ?? [];
  list.push({ message });
  byFile.set(rel, list);
}

/** `site.i18n` と `translation_key` の整合性を検証する（warning のみ）。 */
export function validateI18nWarnings(
  entries: ReadonlyArray<{ readonly rel: string; readonly source: string }>,
  site: SoraneConfig["site"],
): Map<string, readonly I18nValidateWarning[]> {
  const byFile = new Map<string, I18nValidateWarning[]>();
  const ctx = resolveI18nContext(site);

  if (!ctx.enabled) {
    for (const { rel, source } of entries) {
      const p = parseConcept("", rel, source);
      if (translationKeyFromFrontmatter(p.concept.frontmatter)) {
        addWarning(
          byFile,
          rel,
          "translation_key has no effect without site.i18n.locales",
        );
      }
    }
    return byFile;
  }

  const parsed = entries.map((e) => parseConcept("", e.rel, e.source));
  const groups = new Map<
    string,
    Map<string, { readonly rel: string; readonly key?: string }>
  >();

  for (const p of parsed) {
    const localeId = localeIdFromRelPath(p.relPath, ctx);
    const groupKey = translationGroupKey(p, ctx);
    const explicitKey = translationKeyFromFrontmatter(p.concept.frontmatter);

    let byLocale = groups.get(groupKey);
    if (!byLocale) {
      byLocale = new Map();
      groups.set(groupKey, byLocale);
    }
    const existing = byLocale.get(localeId);
    if (existing) {
      addWarning(
        byFile,
        p.relPath,
        `duplicate translation group entry in locale ${localeId} (${existing.rel})`,
      );
    }
    byLocale.set(localeId, { rel: p.relPath, key: explicitKey });
  }

  const configuredLocales = [DEFAULT_LOCALE_ID, ...Object.keys(ctx.locales)];

  for (const [, byLocale] of groups) {
    const explicitKeys = new Set(
      [...byLocale.values()].map((v) => v.key).filter((k): k is string => Boolean(k)),
    );

    if (explicitKeys.size > 1) {
      const joined = [...explicitKeys].sort().join(", ");
      for (const { rel } of byLocale.values()) {
        addWarning(byFile, rel, `translation_key mismatch within group (${joined})`);
      }
    }

    const usesExplicitKey = [...byLocale.values()].some((e) => e.key);
    if (!usesExplicitKey) continue;

    for (const [localeId, entry] of byLocale) {
      for (const targetLocale of configuredLocales) {
        if (targetLocale === localeId || byLocale.has(targetLocale)) continue;
        addWarning(
          byFile,
          entry.rel,
          missingSiblingMessage(targetLocale, ctx),
        );
      }
    }
  }

  const byLogicalPath = new Map<
    string,
    Array<{ readonly rel: string; readonly key?: string; readonly groupKey: string }>
  >();
  for (const p of parsed) {
    const logical = logicalRelPath(p.relPath, ctx).replace(/\.md$/i, "");
    const list = byLogicalPath.get(logical) ?? [];
    list.push({
      rel: p.relPath,
      key: translationKeyFromFrontmatter(p.concept.frontmatter),
      groupKey: translationGroupKey(p, ctx),
    });
    byLogicalPath.set(logical, list);
  }

  for (const [, entries] of byLogicalPath) {
    if (entries.length < 2) continue;
    const groupKeys = new Set(entries.map((e) => e.groupKey));
    if (groupKeys.size <= 1) continue;
    const withKey = entries.filter((e) => e.key);
    const withoutKey = entries.filter((e) => !e.key);
    if (withKey.length === 0 || withoutKey.length === 0) continue;
    const keyed = withKey.map((e) => e.rel).join(", ");
    const plain = withoutKey.map((e) => e.rel).join(", ");
    for (const entry of withKey) {
      addWarning(
        byFile,
        entry.rel,
        `translation_key set but mirrored sibling lacks matching key (${plain})`,
      );
    }
    for (const entry of withoutKey) {
      addWarning(
        byFile,
        entry.rel,
        `mirrored locale sibling uses translation_key; set the same key (${keyed})`,
      );
    }
  }

  return byFile;
}

function missingSiblingMessage(targetLocale: string, ctx: I18nContext): string {
  if (targetLocale === DEFAULT_LOCALE_ID) {
    return `translation_key missing sibling for default locale (${ctx.defaultLang})`;
  }
  const spec = ctx.locales[targetLocale];
  const label = spec ? `${targetLocale} (${spec.lang})` : targetLocale;
  return `translation_key missing sibling for locale ${label}`;
}