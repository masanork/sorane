/**
 * Resolve which OKFC packs to write (site + explicit + auto directory units).
 */

import type { OkfConcept, OkfcMetaInput, OkfcPackConcept, ParsedConcept } from "@sorane/okf";
import type { OkfcUnitConfig, ResolvedOkfcBuildConfig } from "./okfc-config.ts";

export interface OkfcEligibleConcept {
  readonly concept: OkfConcept;
  readonly slug: string;
  readonly relPath: string;
}

export interface OkfcPackPlan {
  readonly id: string;
  /** Path relative to out_dir. */
  readonly outRel: string;
  readonly meta: OkfcMetaInput;
  readonly concepts: readonly OkfcPackConcept[];
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function dirnameOf(rel: string): string {
  const n = normalizeRel(rel);
  const i = n.lastIndexOf("/");
  return i < 0 ? "" : n.slice(0, i);
}

function slugifyId(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .replace(/\/+/g, "-")
    .replace(/[^a-zA-Z0-9._\u3040-\u30ff\u3400-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "unit";
}

function dirMatches(dirRel: string, prefixes: readonly string[]): boolean {
  const d = normalizeRel(dirRel);
  for (const p of prefixes) {
    const pref = normalizeRel(p).replace(/\/$/, "");
    if (pref.length === 0) continue;
    if (d === pref || d.startsWith(`${pref}/`)) return true;
  }
  return false;
}

function matchesUnit(e: OkfcEligibleConcept, unit: OkfcUnitConfig): boolean {
  const m = unit.match;
  if (!m || ((!m.dirs || m.dirs.length === 0) && (!m.types || m.types.length === 0))) {
    // empty match = nothing (avoid accidental full-site clones)
    return false;
  }
  const dirOk =
    !m.dirs || m.dirs.length === 0 || dirMatches(dirnameOf(e.relPath), m.dirs);
  const typeOk =
    !m.types || m.types.length === 0 || m.types.includes(e.concept.type);
  return dirOk && typeOk;
}

export interface ResolveOkfcPackPlansOptions {
  readonly siteTitle: string;
  readonly siteDescription?: string;
  readonly baseUrl: string;
  readonly packTool?: string;
}

/** Build pack plans for site + units (explicit + auto directories). */
export function resolveOkfcPackPlans(
  eligible: readonly OkfcEligibleConcept[],
  okfc: ResolvedOkfcBuildConfig,
  opts: ResolveOkfcPackPlansOptions,
): readonly OkfcPackPlan[] {
  const plans: OkfcPackPlan[] = [];
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const packTool = opts.packTool;

  if (okfc.site) {
    const path = "okf/site.okfc";
    plans.push({
      id: "site",
      outRel: path,
      meta: {
        bundle_id: baseUrl || opts.siteTitle || "site",
        title: opts.siteTitle,
        description: opts.siteDescription,
        bundle_type: "site",
        bundle_uri: baseUrl ? `${baseUrl}/okf/site` : undefined,
        pack_tool: packTool,
      },
      concepts: eligible.map((e) => ({ concept: e.concept, slug: e.slug })),
    });
  }

  const usedIds = new Set(plans.map((p) => p.id));
  const usedOut = new Set(plans.map((p) => p.outRel));

  for (const unit of okfc.units) {
    const id = unit.id.trim();
    if (!id || usedIds.has(id)) continue;
    const concepts = eligible
      .filter((e) => matchesUnit(e, unit))
      .map((e) => ({ concept: e.concept, slug: e.slug }));
    if (concepts.length === 0) continue;
    const outRel = (unit.out ?? `${okfc.units_dir}/${id}.okfc`).replace(/\\/g, "/");
    if (usedOut.has(outRel)) continue;
    usedIds.add(id);
    usedOut.add(outRel);
    plans.push({
      id,
      outRel,
      meta: {
        bundle_id: id,
        title: unit.title ?? id,
        description: unit.description,
        bundle_type: unit.bundle_type ?? "book",
        bundle_uri: baseUrl ? `${baseUrl}/${outRel.replace(/\.okfc$/, "")}` : undefined,
        pack_tool: packTool,
      },
      concepts,
    });
  }

  if (okfc.auto_directories) {
    const byDir = new Map<string, OkfcEligibleConcept[]>();
    for (const e of eligible) {
      const dir = dirnameOf(e.relPath);
      if (!dir) continue;
      // top-level segment only for auto (datasets, not datasets/a/b as separate
      // unless it has its own min_entries — use full dir path for subdirs)
      const list = byDir.get(dir) ?? [];
      list.push(e);
      byDir.set(dir, list);
    }
    for (const [dir, list] of [...byDir.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      if (list.length < okfc.min_entries) continue;
      const id = slugifyId(dir);
      if (usedIds.has(id)) continue;
      const outRel = `${okfc.units_dir}/${id}.okfc`;
      if (usedOut.has(outRel)) continue;
      usedIds.add(id);
      usedOut.add(outRel);
      const title = dir
        .split("/")
        .pop()!
        .split(/[-_]+/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      plans.push({
        id,
        outRel,
        meta: {
          bundle_id: id,
          title,
          description: `OKFC unit for content/${dir}`,
          bundle_type: "book",
          bundle_uri: baseUrl ? `${baseUrl}/${outRel.replace(/\.okfc$/, "")}` : undefined,
          pack_tool: packTool,
        },
        concepts: list.map((e) => ({ concept: e.concept, slug: e.slug })),
      });
    }
  }

  return plans;
}

/** Filter parsed pages to OKFC-eligible concepts (same rules as site bundle). */
export function toOkfcEligible(
  parsed: readonly ParsedConcept[],
  opts: {
    includeDrafts: boolean;
    includePageInBuild: (concept: OkfConcept, includeDrafts: boolean) => boolean;
    isNotFoundSource: (relPath: string) => boolean;
    slugFromRel: (relPath: string) => string;
  },
): OkfcEligibleConcept[] {
  const out: OkfcEligibleConcept[] = [];
  for (const p of parsed) {
    if (!opts.includePageInBuild(p.concept, opts.includeDrafts)) continue;
    if (p.concept.type === "index") continue;
    if (opts.slugFromRel(p.relPath) === "index") continue;
    if (opts.isNotFoundSource(p.relPath)) continue;
    out.push({
      concept: p.concept,
      slug: opts.slugFromRel(p.relPath),
      relPath: normalizeRel(p.relPath),
    });
  }
  return out;
}
