#!/usr/bin/env bash
# Deprecated: sync historical v0 contracts from the v0 repo into
# v0-reference/contracts/.
#
# Contract authority moved to packages/contracts in the runtime repo. This
# script remains only as an archival/manual recovery helper; CI and normal
# development must not depend on it.
#
# Usage:
#   bash scripts/sync-v0.sh
#   V0_REPO_PATH=/path/to/transformotion-apps-b8 bash scripts/sync-v0.sh
#   V0_SYNC_FORCE=1 bash scripts/sync-v0.sh
#
# The script mirrors only transformotion-apps-b8/contracts/. It does not know
# or enforce the final M15 contract structure.

set -euo pipefail

cat >&2 <<EOF
WARNING: pnpm sync:v0 is deprecated.
Contracts are now canonical in packages/contracts. v0-reference is a frozen
archive trail, not a required build input.
EOF

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_ROOT="$REPO_ROOT/v0-reference"
TARGET="$TARGET_ROOT/contracts"
MANIFEST="$TARGET_ROOT/.contracts-manifest.sha256"
README="$TARGET_ROOT/README.md"

FORCE="${V0_SYNC_FORCE:-${FORCE:-}}"
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

resolve_v0_repo() {
  if [[ -n "${V0_REPO_PATH:-}" ]]; then
    cd "$V0_REPO_PATH" 2>/dev/null && pwd
    return
  fi

  cd "$REPO_ROOT/../transformotion-apps-b8" 2>/dev/null && pwd
}

V0_REPO="$(resolve_v0_repo || true)"
if [[ -z "$V0_REPO" || ! -d "$V0_REPO" ]]; then
  cat >&2 <<EOF
ERROR: v0 repo not found.

Expected sibling repo:
  $REPO_ROOT/../transformotion-apps-b8

Or set:
  V0_REPO_PATH=/path/to/transformotion-apps-b8
EOF
  exit 1
fi

V0_CONTRACTS="$V0_REPO/contracts"
if [[ ! -d "$V0_CONTRACTS" ]]; then
  cat >&2 <<EOF
ERROR: v0 contracts directory not found:
  $V0_CONTRACTS
EOF
  exit 1
fi

hash_contracts_tree() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    return 0
  fi

  (
    cd "$dir"
    find . -type f -print0 \
      | sort -z \
      | xargs -0 -r sha256sum
  )
}

target_has_files() {
  [[ -d "$TARGET" ]] && find "$TARGET" -type f -print -quit | grep -q .
}

refuse_if_target_was_edited() {
  if ! target_has_files; then
    return
  fi

  if [[ ! -f "$MANIFEST" ]]; then
    if [[ "$FORCE" == "1" || "$FORCE" == "true" ]]; then
      return
    fi

    cat >&2 <<EOF
ERROR: $TARGET already contains files but no sync manifest exists.

This script refuses to overwrite an unverified generated contracts target.
If this is the first #134 sync over an older v0-reference checkout, rerun with:

  V0_SYNC_FORCE=1 bash scripts/sync-v0.sh

or:

  bash scripts/sync-v0.sh --force
EOF
    exit 1
  fi

  local current_manifest
  current_manifest="$(mktemp)"
  hash_contracts_tree "$TARGET" > "$current_manifest"

  if ! cmp -s "$current_manifest" "$MANIFEST"; then
    rm -f "$current_manifest"
    if [[ "$FORCE" == "1" || "$FORCE" == "true" ]]; then
      return
    fi

    cat >&2 <<EOF
ERROR: local modifications detected in generated contracts target:
  $TARGET

Edit canonical contracts in:
  $V0_CONTRACTS

Then rerun the sync. To discard local generated-target edits explicitly:

  V0_SYNC_FORCE=1 bash scripts/sync-v0.sh
EOF
    exit 1
  fi

  rm -f "$current_manifest"
}

write_readme() {
  mkdir -p "$TARGET_ROOT"
  cat > "$README" <<EOF
# v0 Reference

Deprecated generated content. Do not edit this directory directly.

Contract authority now lives in:

  packages/contracts/

This directory is an archival snapshot only. The deprecated sync helper can
populate:

  v0-reference/contracts/

but CI, deploy workflows, and runtime package imports must not depend on it.

See v0-reference/ARCHIVED.md for the final observed sync commit.
EOF
}

sync_contracts() {
  mkdir -p "$TARGET_ROOT"

  if command -v rsync >/dev/null 2>&1; then
    mkdir -p "$TARGET"
    rsync -a --delete "$V0_CONTRACTS/" "$TARGET/"
  else
    rm -rf "$TARGET"
    mkdir -p "$TARGET"
    cp -R "$V0_CONTRACTS/." "$TARGET/"
  fi
}

refuse_if_target_was_edited
sync_contracts
hash_contracts_tree "$TARGET" > "$MANIFEST"
write_readme

echo "Synced v0 contracts:"
echo "  from: $V0_CONTRACTS"
echo "  to:   $TARGET"
