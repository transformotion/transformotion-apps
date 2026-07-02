#!/usr/bin/env bash
# Deprecated compatibility entrypoint.
#
# Contract authority moved from transformotion-apps-b8/contracts to this repo's
# packages/contracts in the v0 retirement Phase 1. The old byte-identity check
# is intentionally gone; this entrypoint now validates the repo-owned package.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cat >&2 <<EOF
WARNING: check:v0-contracts no longer compares against transformotion-apps-b8.
Running the repo-owned packages/contracts validator instead.
EOF

bash "$REPO_ROOT/scripts/ci/check-contracts-internal.sh"
