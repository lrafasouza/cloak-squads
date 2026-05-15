#!/usr/bin/env bash
# F-505 (audit Pass 5) — produce a reproducible, third-party-verifiable
# build of the cloak-gatekeeper program suitable for mainnet deploy.
#
# `anchor build --verifiable` runs cargo-build-sbf inside a pinned Docker
# image (solanalabs/solana / projectserum/build) so the output bytecode
# is byte-for-byte reproducible regardless of who runs it. The resulting
# binary lands at target/verifiable/cloak_gatekeeper.so along with a
# `verifiable-build.json` manifest.
#
# Use the output:
#   - Publish `target/verifiable/cloak_gatekeeper.so` alongside the
#     deploy transaction so independent reviewers can rebuild with this
#     script + the tagged commit and `sha256sum` the result against the
#     on-chain binary.
#   - For the deploy itself, prefer write-buffer + Squads-wrapped
#     `BpfLoaderUpgradeable::Upgrade` (see docs/security/governance.md).
#
# Pre-conditions:
#   - Docker daemon running (verifiable build runs inside a container).
#   - Anchor 0.31.1 CLI installed locally (the script delegates to it).
#   - Working tree clean (committed). The verifiable build's manifest
#     records the git commit hash — uncommitted changes would not be
#     reproducible by a reviewer.
#
# Usage:
#   scripts/build-verifiable.sh

set -euo pipefail

PROGRAM_NAME="cloak-gatekeeper"

# Refuse to run with a dirty working tree — the whole point of a
# verifiable build is that a reviewer with the same commit can
# reproduce the binary.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree is dirty. Commit or stash changes before a verifiable build."
  echo "   Uncommitted changes would not be reproducible from the recorded commit hash."
  git status --short
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker not found. Verifiable builds run inside a pinned container."
  echo "   Install Docker Desktop (macOS) or docker-ce (Linux) and re-run."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker daemon is not running. Start Docker Desktop and re-run."
  exit 1
fi

if ! command -v anchor >/dev/null 2>&1; then
  echo "❌ anchor CLI not found in PATH. Install via:"
  echo "     cargo install --version 0.31.1 anchor-cli --locked"
  exit 1
fi

COMMIT="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"

echo "═══════════════════════════════════════════════════════════════════"
echo " Verifiable build of ${PROGRAM_NAME}"
echo " Commit: ${COMMIT}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

anchor build --verifiable --program-name "${PROGRAM_NAME}"

ART="target/verifiable/${PROGRAM_NAME//-/_}.so"
if [[ ! -f "${ART}" ]]; then
  echo "❌ Verifiable artefact not found at ${ART}"
  exit 1
fi

SHA="$(shasum -a 256 "${ART}" | awk '{print $1}')"
SIZE="$(wc -c < "${ART}" | tr -d ' ')"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo " ✅ Build complete"
echo "═══════════════════════════════════════════════════════════════════"
echo " Commit:          ${COMMIT}"
echo " Artifact:        ${ART}"
echo " Size:            ${SIZE} bytes"
echo " sha256:          ${SHA}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Reviewers reproduce this build by:"
echo "  git fetch && git checkout ${SHORT}"
echo "  scripts/build-verifiable.sh"
echo "  shasum -a 256 ${ART}      # expect: ${SHA}"
echo ""
echo "Compare against the on-chain bytecode after deploy:"
echo "  solana program dump <PROGRAM_ID> /tmp/onchain.so --url <cluster>"
echo "  shasum -a 256 /tmp/onchain.so   # must match ${SHA}"
