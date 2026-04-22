#!/usr/bin/env bash
# scripts/ci/typecheck-staged-workspaces.sh
#
# Pre-commit check: identifies the workspace(s) containing staged
# TypeScript files and runs typecheck on those workspaces directly
# (bypasses turbo to avoid build-chain overhead in the commit loop).
#
# lint-staged passes the list of changed files as $@.
#
# EXCLUSIONS
# ----------
# @transformotion/infra (infrastructure/) is excluded from pre-commit
# typecheck. Running tsc --noEmit against AWS-CDK type definitions takes
# 60-120s and has been observed hanging entirely — both conflict with
# pre-commit's "fast feedback" goal. CI's pnpm turbo typecheck still covers
# infrastructure, so no verification coverage is lost.
# See: https://github.com/transformotion/transformotion-apps/pull/44
#
# TIMEOUT
# -------
# Each workspace typecheck is wrapped in a 60s timeout as belt-and-braces
# defence. If any workspace exceeds this limit the hook fails with a clear
# message rather than hanging indefinitely.

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
    /*)
      # Unix absolute path (e.g. /c/Users/... from MSYS2/Git Bash lint-staged)
      normalised+=("${f#"$cwd/"}") ;;
    [A-Za-z]:*)
      # Windows absolute path (e.g. C:\Users\... from lint-staged on Windows)
      # Convert drive letter to POSIX mount point: C:\foo -> /c/foo -> relative
      drive="${f:0:1}"
      drive_lower="${drive,,}"
      rest="${f:2}"
      rest="${rest//\\//}"
      unix_f="/${drive_lower}${rest}"
      normalised+=("${unix_f#"$cwd/"}") ;;
    *)
      normalised+=("$f") ;;
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

# Workspaces excluded from pre-commit typecheck (see header comment).
EXCLUDED_WORKSPACES=("@transformotion/infra")

FAILED=0

for name in "${!SEEN_WORKSPACES[@]}"; do
  ws_path="${SEEN_WORKSPACES[$name]}"

  # Skip excluded workspaces — CI covers them.
  excluded=0
  for excl in "${EXCLUDED_WORKSPACES[@]}"; do
    if [[ "$name" == "$excl" ]]; then
      excluded=1
      break
    fi
  done
  if [[ $excluded -eq 1 ]]; then
    echo "Skipping typecheck for $name ($ws_path) — excluded from pre-commit (CI covers this)."
    continue
  fi

  echo "Typechecking $name ($ws_path)..."
  typecheck_exit=0
  timeout 60s pnpm --filter="$name" run typecheck 2>&1 || typecheck_exit=$?
  if [[ $typecheck_exit -ne 0 ]]; then
    if [[ $typecheck_exit -eq 124 ]]; then
      echo >&2 "PRE-COMMIT FAIL: typecheck timed out after 60s for $name. Fix or use --no-verify."
    fi
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
