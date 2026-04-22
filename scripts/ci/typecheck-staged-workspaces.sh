#!/usr/bin/env bash
# scripts/ci/typecheck-staged-workspaces.sh
#
# Pre-commit check: identifies the workspace(s) containing staged
# TypeScript files and runs typecheck on those workspaces directly
# (bypasses turbo to avoid build-chain overhead in the commit loop).
#
# lint-staged passes the list of changed files as $@.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  exit 0
fi

# Normalise paths to be relative to CWD.
# lint-staged v16 passes absolute paths on some platforms; the workspace-
# detection loop below relies on relative paths and uses "." as the
# loop-termination sentinel. Strip the CWD prefix from any absolute path
# that falls inside the repo root; leave paths that are already relative
# or that fall outside CWD unchanged.
cwd="$(pwd)"
normalised=()
for f in "$@"; do
  case "$f" in
    /*) normalised+=("${f#"$cwd/"}") ;;
    *)  normalised+=("$f") ;;
  esac
done
set -- ${normalised[@]+"${normalised[@]}"}

if [[ $# -eq 0 ]]; then
  exit 0
fi

# Identify affected workspace directories by walking up from each staged
# file until we find a package.json with a "name" field.
declare -A SEEN_WORKSPACES

for file in "$@"; do
  dir=$(dirname "$file")
  while [[ "$dir" != "." && "$dir" != "/" ]]; do
    if [[ -f "$dir/package.json" ]]; then
      pkg_name=$(node -e "try { const p=require('./$dir/package.json'); if(p.name) process.stdout.write(p.name); } catch(e){}" 2>/dev/null || true)
      if [[ -n "$pkg_name" ]]; then
        SEEN_WORKSPACES["$pkg_name"]="$dir"
        break
      fi
    fi
    dir=$(dirname "$dir")
  done
done

if [[ ${#SEEN_WORKSPACES[@]} -eq 0 ]]; then
  exit 0
fi

FAILED=0

for name in "${!SEEN_WORKSPACES[@]}"; do
  ws_path="${SEEN_WORKSPACES[$name]}"
  echo "Typechecking $name ($ws_path)..."
  if ! pnpm --filter="$name" run typecheck 2>&1; then
    FAILED=1
  fi
done

if [[ $FAILED -ne 0 ]]; then
  echo >&2
  echo "PRE-COMMIT FAIL: typecheck failed. Fix the errors above." >&2
  echo "Use 'git commit --no-verify' to bypass if intentional." >&2
  exit 1
fi

exit 0
