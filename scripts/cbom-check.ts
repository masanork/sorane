import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { SUPPORTED_HASH_ALGORITHMS } from "../supply-chain/hash-algorithms.ts";

interface CbomComponent {
  readonly "bom-ref"?: string;
  readonly cryptoProperties?: {
    readonly assetType?: string;
    readonly algorithmProperties?: {
      readonly primitive?: string;
    };
    readonly oid?: string;
  };
}

interface CbomDoc {
  readonly components?: readonly CbomComponent[];
}

const ROOT = resolve(import.meta.dirname, "..");
const CBOM_PATH = join(ROOT, "cbom.json");
const SCAN_DIRS = [
  join(ROOT, "packages/font/src"),
  join(ROOT, "packages/search/src"),
  join(ROOT, "packages/core/src"),
];

function loadCbomHashOids(): Map<string, string> {
  const raw = readFileSync(CBOM_PATH, "utf8");
  const doc = JSON.parse(raw) as CbomDoc;
  const map = new Map<string, string>();
  for (const comp of doc.components ?? []) {
    const cp = comp.cryptoProperties;
    if (cp?.assetType !== "algorithm") continue;
    if (cp.algorithmProperties?.primitive !== "hash") continue;
    const oid = cp.oid;
    const ref = comp["bom-ref"];
    if (!oid || !ref) continue;
    map.set(ref, oid);
  }
  return map;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

function scanCreateHashLiterals(): Set<string> {
  const found = new Set<string>();
  const re = /createHash\(\s*["']([^"']+)["']\s*\)/g;
  for (const dir of SCAN_DIRS) {
    for (const file of listTsFiles(dir)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(re)) {
        found.add(match[1]!);
      }
    }
  }
  return found;
}

function main(): void {
  const errors: string[] = [];
  const catalog = new Map(
    SUPPORTED_HASH_ALGORITHMS.map((a) => [a.bomRef, a.oid]),
  );
  const cbom = loadCbomHashOids();

  for (const [ref, oid] of catalog) {
    if (cbom.get(ref) !== oid) {
      errors.push(`catalog ${ref} (${oid}) missing or mismatched in cbom.json`);
    }
  }
  for (const [ref, oid] of cbom) {
    if (catalog.get(ref) !== oid) {
      errors.push(`cbom.json ${ref} (${oid}) not in supply-chain/hash-algorithms.ts`);
    }
  }

  const used = scanCreateHashLiterals();
  const catalogAlgos = new Set(
    SUPPORTED_HASH_ALGORITHMS.map((a) => a.nodeName),
  );
  for (const algo of used) {
    if (!catalogAlgos.has(algo)) {
      errors.push(`createHash('${algo}') in source but not in hash catalog`);
    }
  }

  if (errors.length > 0) {
    for (const err of errors) console.error(`cbom-check: ${err}`);
    process.exit(1);
  }
  console.log(
    `cbom-check: ok (${catalog.size} hash algorithm(s), ${used.size} in use)`,
  );
}

main();