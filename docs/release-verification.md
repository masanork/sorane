# Verifying a sorane release

Every tagged sorane release (`v*`) ships with **SLSA v1.0 Build-L3 provenance**,
per-artifact **SHA-256** sidecars, a **CBOM**, and an **SBOM**. This guide is the
relying-party procedure to confirm that the npm pack tarballs / source archive /
BOM files you downloaded were built from the tagged sorane source by the sorane
release workflow.

## What a release contains

| Asset | What it is |
|-------|------------|
| `sorane-*.tgz` (×5) | npm pack outputs for `@sorane/font`, `@sorane/okf`, `@sorane/search`, `@sorane/core`, `@sorane/cli` |
| `sorane-<tag>.tar.gz` | tag-pinned source archive |
| `cbom.json` | Cryptography BOM: in-process hash algorithms sorane dispatches |
| `sbom.json` | Software BOM: third-party npm packages from `package-lock.json` |
| `*.sha256` | one SHA-256 sidecar per tarball + `cbom.json` + `sbom.json` |
| `sorane-<tag>.intoto.jsonl` | SLSA provenance covering every artifact above |

> CBOM vs SBOM: the **CBOM** is the crypto sorane uses in-process (today: SHA-256
> for integrity). Optional C2PA signing is delegated to external `c2patool`. The
> **SBOM** is the npm dependency tree sorane is built from.

## Prerequisites

```bash
# slsa-verifier (https://github.com/slsa-framework/slsa-verifier)
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@latest
# plus: gh (GitHub CLI), jq, and sha256sum (coreutils) / shasum -a 256 (macOS)
```

## Step 1 — download the artifacts

```bash
VERSION=0.2.6   # without the leading v
gh release download "v$VERSION" --repo github.com/masanork/sorane \
  --pattern 'sorane-cli-*.tgz' \
  --pattern 'cbom.json' \
  --pattern 'sbom.json' \
  --pattern '*.intoto.jsonl'
```

Add `--pattern` entries for the other `@sorane/*` tarballs and the source archive
as needed.

## Step 2 — verify SLSA provenance

```bash
slsa-verifier verify-artifact sorane-cli-${VERSION}.tgz \
  --provenance-path "sorane-v${VERSION}.intoto.jsonl" \
  --source-uri github.com/masanork/sorane \
  --source-tag "v${VERSION}"
```

Repeat for each tarball, `cbom.json`, `sbom.json`, and the source archive.

## Step 3 — verify SHA-256 sidecars

```bash
sha256sum -c sorane-cli-${VERSION}.tgz.sha256
sha256sum -c cbom.json.sha256
sha256sum -c sbom.json.sha256
```

## Step 4 — verify GitHub BOM attestations (optional)

```bash
gh attestation verify cbom.json --repo masanork/sorane
gh attestation verify sbom.json --repo masanork/sorane
```

## npm registry provenance

Tagged releases also publish to npm with `npm publish --provenance` from CI.
GitHub Release artifacts remain the canonical SLSA L3 bundle for verification.