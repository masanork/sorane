/**
 * build.okfc — multi-unit OKFC packing (FTS complete; embeddings via build.knowledge).
 */

export interface OkfcUnitMatch {
  /** Content-relative directory prefixes (e.g. `datasets`, `glossary/terms`). */
  readonly dirs?: readonly string[];
  /** OKF concept types. */
  readonly types?: readonly string[];
}

export interface OkfcUnitConfig {
  /** Stable unit id (also default filename stem). */
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  /** OKFC bundle_type (site | book | spec | schema-bundle | custom). */
  readonly bundle_type?: string;
  readonly match?: OkfcUnitMatch;
  /** Output path relative to out_dir. Default: `{units_dir}/{id}.okfc`. */
  readonly out?: string;
}

/**
 * Optional OKFC packing policy. Effective when `build.outputs.okfc: true`.
 * Vectors (`embeddings`) reserved for a later phase — FTS is always produced.
 */
export interface OkfcBuildConfig {
  /** Emit site-wide `okf/site.okfc`. Default true. */
  readonly site?: boolean;
  /**
   * Auto-create one unit per content subdirectory with ≥ min_entries pages.
   * Default true when outputs.okfc is on.
   */
  readonly auto_directories?: boolean;
  /** Min pages for auto unit (default 2). */
  readonly min_entries?: number;
  /** Directory under out_dir for unit files (default `okf/units`). */
  readonly units_dir?: string;
  /** Explicit units (in addition to auto_directories when enabled). */
  readonly units?: readonly OkfcUnitConfig[];
  /** Write `okf/registry.json`. Default true. */
  readonly registry?: boolean;
  /**
   * @deprecated Prefer `build.knowledge.embeddings`.
   * When set, overrides knowledge embeddings for OKFC pack only (`off` | `auto` | `on`).
   * Legacy `false` maps to `off`.
   */
  readonly embeddings?: false | "off" | "auto" | "on";
}

export interface ResolvedOkfcBuildConfig {
  readonly site: boolean;
  readonly auto_directories: boolean;
  readonly min_entries: number;
  readonly units_dir: string;
  readonly units: readonly OkfcUnitConfig[];
  readonly registry: boolean;
}

export function resolveOkfcBuildConfig(
  raw: OkfcBuildConfig | undefined,
  outputsOkfc: boolean,
): ResolvedOkfcBuildConfig {
  if (!outputsOkfc) {
    return {
      site: false,
      auto_directories: false,
      min_entries: 2,
      units_dir: "okf/units",
      units: [],
      registry: false,
    };
  }
  return {
    site: raw?.site !== false,
    auto_directories: raw?.auto_directories !== false,
    min_entries: Math.max(1, raw?.min_entries ?? 2),
    units_dir: (raw?.units_dir ?? "okf/units").replace(/\\/g, "/").replace(/\/$/, ""),
    units: raw?.units ?? [],
    registry: raw?.registry !== false,
  };
}

/** Resolve OKFC embed mode: okfc.embeddings override, else knowledge.embeddings. */
export function resolveOkfcEmbeddingsMode(
  okfcRaw: OkfcBuildConfig | undefined,
  knowledgeEmbeddings: "off" | "auto" | "on",
): "off" | "auto" | "on" {
  const e = okfcRaw?.embeddings;
  if (e === false || e === "off") return "off";
  if (e === "auto" || e === "on") return e;
  return knowledgeEmbeddings;
}
