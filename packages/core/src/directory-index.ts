import type { ParsedConcept } from "@sorane/okf";
import { isBuildableContentType } from "@sorane/okf";
import type { SoraneConfig } from "./config.ts";
import {
  localeIdFromRelPath,
  logicalRelPath,
  resolvePageLocaleInfo,
  type I18nContext,
} from "./i18n.ts";
import { escapeHtml } from "./render.ts";
import { relLinkFrom } from "./ssg.ts";
import { isNotFoundSource } from "./not-found.ts";
import { isSearchView } from "./ssg.ts";

export interface DirectoryIndexEntry {
  readonly title: string;
  readonly href: string;
  readonly type: string;
  readonly slug: string;
  readonly description?: string;
}

export interface DirectoryIndexSpec {
  readonly dirRel: string;
  readonly localeId: string;
  readonly pathPrefix: string;
  readonly entries: readonly DirectoryIndexEntry[];
}

const AUTO_INDEXED_DIRS = new Set(["glossary/terms"]);

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function posixDirname(rel: string): string {
  const norm = normalizeRel(rel);
  const i = norm.lastIndexOf("/");
  return i < 0 ? "" : norm.slice(0, i);
}

function slugFromLogical(logical: string): string {
  const base = logical.split("/").pop() ?? logical;
  return base.replace(/\.md$/i, "");
}

function isSystemPage(concept: ParsedConcept["concept"]): boolean {
  return concept.frontmatter.isSystem === true;
}

function isEligibleForDirectoryListing(p: ParsedConcept): boolean {
  if (!isBuildableContentType(p.concept.type, p.concept.profile)) return false;
  if (isSystemPage(p.concept)) return false;
  if (isNotFoundSource(p.relPath)) return false;
  if (isSearchView(p.concept.frontmatter)) return false;
  if (p.concept.type === "index") return false;
  const logical = normalizeRel(p.relPath);
  if (slugFromLogical(logical) === "index") return false;
  return true;
}

export function humanizeDirectoryLabel(dirRel: string): string {
  const segment = dirRel.split("/").pop() ?? dirRel;
  return segment
    .split(/[-_]+/)
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export interface DiscoverDirectoryIndexesOptions {
  readonly minEntries?: number;
}

/** 作者 `index.md` が無いサブディレクトリ向け OKF ディレクトリ一覧を検出する。 */
export function discoverDirectoryIndexes(
  parsed: readonly ParsedConcept[],
  config: SoraneConfig,
  i18n: I18nContext,
  opts?: DiscoverDirectoryIndexesOptions,
): readonly DirectoryIndexSpec[] {
  const minEntries = opts?.minEntries ?? 2;
  const byDir = new Map<string, DirectoryIndexEntry[]>();
  const hasAuthorIndex = new Set<string>();

  for (const p of parsed) {
    const localeId = localeIdFromRelPath(p.relPath, i18n);
    const logical = logicalRelPath(p.relPath, i18n);
    const dirRel = posixDirname(logical);
    const key = `${localeId}\0${dirRel}`;

    if (slugFromLogical(logical) === "index") {
      hasAuthorIndex.add(key);
    }
    if (!isEligibleForDirectoryListing(p)) continue;
    if (dirRel.length === 0 || AUTO_INDEXED_DIRS.has(dirRel)) continue;

    const pageLocale = resolvePageLocaleInfo(p, config, i18n);
    const rawDesc = p.concept.description?.trim();
    const list = byDir.get(key) ?? [];
    list.push({
      title: p.concept.title,
      href: pageLocale.outRel,
      type: p.concept.type,
      slug: slugFromLogical(logical),
      description: rawDesc && rawDesc.length > 0 ? rawDesc : undefined,
    });
    byDir.set(key, list);
  }

  const specs: DirectoryIndexSpec[] = [];
  for (const [key, entries] of byDir) {
    if (hasAuthorIndex.has(key)) continue;
    if (entries.length < minEntries) continue;
    const [localeId, dirRel] = key.split("\0") as [string, string];
    const pathPrefix =
      localeId === "default" ? "" : (i18n.locales[localeId]?.path_prefix ?? "");
    specs.push({
      dirRel,
      localeId,
      pathPrefix,
      entries: entries.sort((a, b) => a.title.localeCompare(b.title)),
    });
  }

  return specs.sort((a, b) =>
    `${a.pathPrefix}/${a.dirRel}`.localeCompare(`${b.pathPrefix}/${b.dirRel}`),
  );
}

/** OKF bundle 向け: frontmatter 無しディレクトリ `index.md`。 */
export function directoryIndexOkfMarkdown(spec: DirectoryIndexSpec): string {
  const title = humanizeDirectoryLabel(spec.dirRel);
  const lines = [`# ${title}`, ""];
  for (const e of spec.entries) {
    const desc = e.description ? ` — ${e.description}` : "";
    lines.push(`- [${e.title}](${e.type}/${e.slug}.md)${desc}`);
  }
  return `${lines.join("\n")}\n`;
}

export function directoryIndexBundlePath(spec: DirectoryIndexSpec): string {
  const prefix = spec.pathPrefix ? `${spec.pathPrefix}/` : "";
  return `${prefix}${spec.dirRel}/index.md`;
}

export function directoryIndexOutRel(spec: DirectoryIndexSpec): string {
  const prefix = spec.pathPrefix ? `${spec.pathPrefix}/` : "";
  return `${prefix}${spec.dirRel}/index.html`;
}

/** ビルド向け HTML 一覧（blog-index スタイル）。 */
export function renderDirectoryIndexBody(
  spec: DirectoryIndexSpec,
  siteTitle: string,
  lang: string,
): string {
  const fromRel = directoryIndexOutRel(spec);
  const dirTitle = humanizeDirectoryLabel(spec.dirRel);
  const indexLabel = lang.startsWith("ja") ? "ディレクトリ" : "Directory";
  const items = spec.entries
    .map((entry) => {
      const href = relLinkFrom(fromRel, entry.href);
      const typeBadge = `<span class="directory-index-type">${escapeHtml(entry.type)}</span>`;
      const desc =
        entry.description && entry.description.length > 0
          ? `<p class="directory-index-desc">${escapeHtml(entry.description)}</p>`
          : "";
      return (
        `<li class="directory-index-item">` +
        `<a href="${escapeHtml(href)}" class="directory-index-link">${escapeHtml(entry.title)}</a>` +
        ` ${typeBadge}` +
        `${desc}` +
        `</li>`
      );
    })
    .join("\n");

  return (
    `<div class="blog-index directory-index">` +
    `<header class="blog-header">` +
    `<p class="directory-index-label">${escapeHtml(indexLabel)}</p>` +
    `<h1>${escapeHtml(siteTitle)} — ${escapeHtml(dirTitle)}</h1>` +
    `</header>` +
    `<ul class="blog-list directory-index-list">${items}</ul>` +
    `</div>`
  );
}

