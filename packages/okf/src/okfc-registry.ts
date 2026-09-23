/**
 * Lightweight multi-bundle registry (OKFC §7-inspired) for agents.
 * Written next to site/unit OKFC files as `okf/registry.json`.
 */

export const OKFC_REGISTRY_SCHEMA_VERSION = 1;

export interface OkfcRegistryBundle {
  readonly id: string;
  /** Site-relative path to the .okfc file (e.g. okf/site.okfc). */
  readonly path: string;
  readonly title?: string;
  readonly description?: string;
  readonly bundle_type?: string;
  readonly bundle_uri?: string;
  readonly concept_count: number;
  readonly chunk_count?: number;
  readonly packed_at?: string;
  readonly search: "fts";
}

export interface OkfcRegistry {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly bundles: readonly OkfcRegistryBundle[];
}

export function buildOkfcRegistry(
  bundles: readonly OkfcRegistryBundle[],
  generatedAt = new Date().toISOString(),
): OkfcRegistry {
  return {
    schema_version: OKFC_REGISTRY_SCHEMA_VERSION,
    generated_at: generatedAt,
    bundles: [...bundles].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function okfcRegistryToJson(registry: OkfcRegistry): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}
