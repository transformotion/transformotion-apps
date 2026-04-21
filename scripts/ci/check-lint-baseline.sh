#!/usr/bin/env bash
# scripts/ci/check-lint-baseline.sh
#
# Runs ESLint across the workspace and fails if any file has MORE violations
# than the recorded baseline. New files with violations also fail.
#
# Usage: scripts/ci/check-lint-baseline.sh
#
# Exits 0 if violations are ≤ baseline; 1 if any file has grown.

set -uo pipefail

BASELINE=".lint-baseline.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_JSON="$(mktemp /tmp/eslint-results-XXXXXX.json)"
trap 'rm -f "$TMP_JSON"' EXIT

if [[ ! -f "$BASELINE" ]]; then
  echo "ERROR: $BASELINE not found. Run:" >&2
  echo "  npx eslint . --format=json | node scripts/ci/generate-lint-baseline.mjs" >&2
  exit 1
fi

echo "Running ESLint across workspace..."
# Allow ESLint exit 1 (violations found) without aborting the script.
npx eslint . --format=json > "$TMP_JSON" 2>/dev/null || true

echo "Comparing against baseline..."
node "$SCRIPT_DIR/check-lint-violations.mjs" "$TMP_JSON" "$BASELINE"
