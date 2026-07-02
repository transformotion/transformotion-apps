#!/usr/bin/env bash
# Validate the repo-owned contract package.
#
# Phase 1 of the v0 retirement moved contract authority into
# packages/contracts. This check intentionally has no transformotion-apps-b8 or
# v0-reference dependency.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if rg -n "from ['\"].*v0-reference|export \* from ['\"].*v0-reference|v0-reference/contracts|transformotion-apps-b8/contracts" "$REPO_ROOT/packages/contracts" --glob '!**/spec/_archive/**' >/tmp/contracts-v0-refs.txt; then
  cat >&2 <<EOF
ERROR: packages/contracts still references the retired v0 contract sync path.

Contracts are now canonical in packages/contracts. Remove these references:
EOF
  cat >&2 /tmp/contracts-v0-refs.txt
  exit 1
fi

pnpm --filter @transformotion/contracts typecheck

echo "OK: packages/contracts is self-contained and typechecks."
