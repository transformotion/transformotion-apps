#!/usr/bin/env bash
# Sync canonical contracts from the v0 repo into v0-reference/contracts/.
# Run from the repo root: ./scripts/sync-v0.sh
# The v0 repo is expected at ../transformotion-apps-b8 relative to this repo.
# Override the location: V0_REPO_PATH=/path/to/v0-repo ./scripts/sync-v0.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve v0 repo path
if [[ -n "${V0_REPO_PATH:-}" ]]; then
  V0_REPO="$V0_REPO_PATH"
else
  V0_REPO="$(cd "$REPO_ROOT/../transformotion-apps-b8" 2>/dev/null && pwd || echo "")"
fi

if [[ -z "$V0_REPO" || ! -d "$V0_REPO" ]]; then
  echo "ERROR: v0 repo not found. Expected at ../transformotion-apps-b8 or set V0_REPO_PATH." >&2
  exit 1
fi

V0_CONTRACTS="$V0_REPO/contracts"
if [[ ! -d "$V0_CONTRACTS" ]]; then
  echo "ERROR: contracts/ directory not found in v0 repo at $V0_REPO." >&2
  exit 1
fi

TARGET="$REPO_ROOT/v0-reference/contracts"
mkdir -p "$TARGET"

if command -v rsync &>/dev/null; then
  rsync -a --delete "$V0_CONTRACTS/" "$TARGET/"
else
  # Fallback for environments without rsync (e.g. Windows Git Bash)
  rm -rf "$TARGET"
  cp -r "$V0_CONTRACTS" "$TARGET"
fi

echo "Synced $V0_CONTRACTS → $TARGET"
