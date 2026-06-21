#!/usr/bin/env node
/**
 * Writes website/static/supply-chain.json and syncs cbom.json for sorane.dev.
 * Updates the auto block in website/content/supply-chain.md when present.
 *
 *   node scripts/supply-chain-status.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  version: string;
};
const CBOM_PATH = join(ROOT, "cbom.json");
const WEBSITE_STATIC = join(ROOT, "website/static");
const SUPPLY_CHAIN_MD = join(ROOT, "website/content/supply-chain.md");

const NPM_PACKAGES = [
  "@sorane/cli",
  "@sorane/core",
  "@sorane/font",
  "@sorane/okf",
  "@sorane/search",
] as const;

const AUTO_START = "<!-- supply-chain-status:auto -->";
const AUTO_END = "<!-- /supply-chain-status:auto -->";

interface CbomDoc {
  readonly metadata?: {
    readonly component?: { readonly version?: string };
  };
  readonly components?: readonly {
    readonly name?: string;
    readonly description?: string;
    readonly cryptoProperties?: {
      readonly algorithmProperties?: { readonly parameterSetIdentifier?: string };
      readonly oid?: string;
    };
    readonly properties?: readonly { readonly name?: string; readonly value?: string }[];
  }[];
}

export interface SupplyChainStatus {
  readonly schema_version: 1;
  readonly generated_at: string;
  readonly version: string;
  readonly release: {
    readonly tag: string;
    readonly url: string;
    readonly assets_url: string;
    readonly slsa_level: "Build-L3";
    readonly npm_publish_provenance: boolean;
  };
  readonly npm_packages: readonly string[];
  readonly cbom: {
    readonly path: string;
    readonly drift_gate: string;
    readonly algorithms: readonly {
      readonly name: string;
      readonly oid: string;
      readonly role: string;
      readonly description: string;
    }[];
    readonly c2pa_note: string;
  };
  readonly sbom: {
    readonly release_asset: string;
    readonly scope: string;
  };
  readonly verification: {
    readonly doc: string;
  };
}

export function buildSupplyChainStatus(version: string): SupplyChainStatus {
  const tag = `v${version}`;
  const repo = "https://github.com/masanork/sorane";
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    version,
    release: {
      tag,
      url: `${repo}/releases/tag/${tag}`,
      assets_url: `${repo}/releases/latest`,
      slsa_level: "Build-L3",
      npm_publish_provenance: true,
    },
    npm_packages: [...NPM_PACKAGES],
    cbom: {
      path: "/cbom.json",
      drift_gate: "npm run cbom-check",
      algorithms: loadCbomAlgorithms(),
      c2pa_note:
        "Optional C2PA signing is delegated to external c2patool; sorane does not hold signing keys.",
    },
    sbom: {
      release_asset: `sbom.json (GitHub Release ${tag})`,
      scope: "Third-party npm packages from package-lock.json",
    },
    verification: {
      doc: `${repo}/blob/main/docs/release-verification.md`,
    },
  };
}

function loadCbomAlgorithms(): SupplyChainStatus["cbom"]["algorithms"] {
  const doc = JSON.parse(readFileSync(CBOM_PATH, "utf8")) as CbomDoc;
  return (doc.components ?? []).map((c) => {
    const role =
      c.properties?.find((p) => p.name === "sorane:role")?.value ?? "—";
    return {
      name: c.name ?? c.cryptoProperties?.algorithmProperties?.parameterSetIdentifier ?? "—",
      oid: c.cryptoProperties?.oid ?? "—",
      role,
      description: c.description ?? "",
    };
  });
}

export function renderStatusMarkdown(status: SupplyChainStatus): string {
  const algoRows = status.cbom.algorithms
    .map(
      (a) =>
        `| ${a.name} | ${a.role} | \`${a.oid}\` | ${a.description.replace(/\|/g, "\\|")} |`,
    )
    .join("\n");
  const pkgList = status.npm_packages.map((p) => `- \`${p}\``).join("\n");

  return `| 項目 | 値 |
|------|-----|
| バージョン | \`${status.version}\` |
| リリースタグ | [\`${status.release.tag}\`](${status.release.url}) |
| SLSA | ${status.release.slsa_level}（\`.intoto.jsonl\`） |
| npm provenance | ${status.release.npm_publish_provenance ? "あり（Trusted Publisher / OIDC）" : "なし"} |
| 生成日時（UTC） | ${status.generated_at} |

### 公開 npm パッケージ

${pkgList}

### プロセス内ハッシュ（CBOM）

| アルゴリズム | 用途 | OID | 説明 |
|-------------|------|-----|------|
${algoRows}

機械可読: [supply-chain.json](/supply-chain.json) · [cbom.json](/cbom.json)`;
}

function syncCbomToWebsite(version: string): void {
  const raw = readFileSync(CBOM_PATH, "utf8");
  const doc = JSON.parse(raw) as {
    metadata?: { component?: { version?: string } };
  };
  if (doc.metadata?.component) {
    doc.metadata.component.version = version;
  }
  const out = `${JSON.stringify(doc, null, 2)}\n`;
  writeFileSync(join(WEBSITE_STATIC, "cbom.json"), out, "utf8");
}

function patchSupplyChainMd(block: string): void {
  let md = readFileSync(SUPPLY_CHAIN_MD, "utf8");
  const start = md.indexOf(AUTO_START);
  const end = md.indexOf(AUTO_END);
  if (start === -1 || end === -1 || end <= start) {
    console.warn("supply-chain-status: markers not found in supply-chain.md, skipping patch");
    return;
  }
  const before = md.slice(0, start + AUTO_START.length);
  const after = md.slice(end);
  md = `${before}\n${block}\n${after}`;
  writeFileSync(SUPPLY_CHAIN_MD, md, "utf8");
}

function main(): void {
  const status = buildSupplyChainStatus(PKG.version);
  writeFileSync(
    join(WEBSITE_STATIC, "supply-chain.json"),
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8",
  );
  syncCbomToWebsite(PKG.version);
  patchSupplyChainMd(renderStatusMarkdown(status));
  console.log(
    `supply-chain-status: ok (v${status.version} → website/static/supply-chain.json)`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(import.meta.filename);

if (isMain) {
  main();
}