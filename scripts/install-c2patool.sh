#!/usr/bin/env bash
# Install c2patool Linux x86_64 binary to /usr/local/bin (CI).
set -euo pipefail
C2PA_VER="${C2PA_VER:-0.26.67}"
ARCHIVE="c2patool-v${C2PA_VER}-x86_64-unknown-linux-gnu.tar.gz"
URL="https://github.com/contentauth/c2pa-rs/releases/download/c2patool-v${C2PA_VER}/${ARCHIVE}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
curl -fsSL "$URL" -o "${tmpdir}/${ARCHIVE}"
tar -xzf "${tmpdir}/${ARCHIVE}" -C "$tmpdir"
install -m 0755 "${tmpdir}/c2patool/c2patool" /usr/local/bin/c2patool
c2patool --version