import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ImportManifest, ImportManifestEntry } from './types.ts';

export const IMPORT_MANIFEST_VERSION = 1 as const;

export function importManifestPath(cwd: string): string {
  return `${cwd}/.sorane/import-manifest.json`;
}

export function loadImportManifest(cwd: string): ImportManifest {
  const path = importManifestPath(cwd);
  if (!existsSync(path)) {
    return { version: IMPORT_MANIFEST_VERSION, entries: [] };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as ImportManifest;
  return {
    version: IMPORT_MANIFEST_VERSION,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  };
}

export function saveImportManifest(cwd: string, manifest: ImportManifest): void {
  const path = importManifestPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function upsertManifestEntry(
  manifest: ImportManifest,
  entry: ImportManifestEntry,
): ImportManifest {
  const rest = manifest.entries.filter((e) => e.sourceId !== entry.sourceId);
  return { version: IMPORT_MANIFEST_VERSION, entries: [...rest, entry] };
}