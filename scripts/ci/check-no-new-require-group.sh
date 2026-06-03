#!/usr/bin/env bash
# scripts/ci/check-no-new-require-group.sh
#
# Fails CI if any handler under the checked paths calls requireGroup.
# requireGroup is deprecated - all handlers were migrated to requireAppAccess /
# requireAccountAccess in sub-phase 7e. Zero usages is the expected baseline.
#
# Checked paths:
#   apps/                 app-specific handlers (Budget Tracker, Stock Analyser)
# When 7e-cleanup removes requireGroup from the middleware package entirely,
# delete this script (it becomes redundant).
#
# Usage: bash scripts/ci/check-no-new-require-group.sh
# Exits 0 if no violations; 1 if any found.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SEARCH_PATHS=(
  "$REPO_ROOT/apps"
)

echo "Checking for requireGroup usage in handler paths..."

VIOLATIONS=()

for base in "${SEARCH_PATHS[@]}"; do
  if [[ ! -d "$base" ]]; then
    continue
  fi
  while IFS= read -r file; do
    if grep -qE '\brequireGroup\s*\(' "$file" 2>/dev/null; then
      VIOLATIONS+=("$file")
    fi
  done < <(find "$base" -name "*.ts" ! -name "*.d.ts" -not -path "*/node_modules/*" -not -path "*/__tests__/*" -not -name "*.test.ts" -not -name "*.spec.ts")
done

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo "OK - no requireGroup calls found."
  exit 0
fi

echo ""
echo "ERROR: requireGroup is deprecated. Migrate to requireAppAccess / requireAccountAccess."
echo "Violations:"
for f in "${VIOLATIONS[@]}"; do
  echo "  $f"
done
exit 1
