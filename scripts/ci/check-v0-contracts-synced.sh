#!/usr/bin/env bash
# Verifies the runtime repo's generated v0 contract sync target mirrors the
# canonical v0 repo contracts directory exactly.
#
# Usage:
#   V0_REPO_PATH=/path/to/transformotion-apps-b8 bash scripts/ci/check-v0-contracts-synced.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET="$REPO_ROOT/v0-reference/contracts"

fail_if_generated_files_are_tracked() {
  local tracked
  tracked="$(git -C "$REPO_ROOT" ls-files 'v0-reference/**')"
  if [[ -n "$tracked" ]]; then
    cat >&2 <<EOF
ERROR: generated v0-reference files are tracked by git.

The v0 sync target must remain gitignored. Remove these files from git:

$tracked
EOF
    exit 1
  fi
}

resolve_v0_contracts() {
  local v0_repo="${V0_REPO_PATH:-$REPO_ROOT/../transformotion-apps-b8}"
  if [[ ! -d "$v0_repo/contracts" ]]; then
    cat >&2 <<EOF
ERROR: v0 contracts directory not found.

Set V0_REPO_PATH to a checkout of transformotion-apps-b8.
Expected contracts at:
  $v0_repo/contracts
EOF
    exit 1
  fi

  (cd "$v0_repo/contracts" && pwd)
}

fail_if_generated_files_are_tracked

V0_CONTRACTS="$(resolve_v0_contracts)"

V0_SYNC_FORCE=1 bash "$REPO_ROOT/scripts/sync-v0.sh"

fail_if_generated_files_are_tracked

if ! diff -qr "$V0_CONTRACTS" "$TARGET"; then
  cat >&2 <<EOF
ERROR: synced v0 contracts differ from canonical v0 repo contracts.

Canonical:
  $V0_CONTRACTS

Synced:
  $TARGET
EOF
  exit 1
fi

echo "OK: v0-reference/contracts is byte-identical to $V0_CONTRACTS"
