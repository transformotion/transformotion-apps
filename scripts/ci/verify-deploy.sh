#!/usr/bin/env bash
# scripts/ci/verify-deploy.sh
#
# Post-deploy verification: confirms the deployed frontend artefact
# matches the commit that triggered the deploy, that every [REQUIRED]
# NEXT_PUBLIC_* variable was substituted at build time, and that the
# deployed URL is reachable.
#
# Usage:
#   scripts/ci/verify-deploy.sh <deployed-url> <path-to-.env.example> <expected-commit-hash>
#
# The [REQUIRED] var substitution check (check 3) reads each var's value
# from the current shell environment. In CI the job-level env block
# provides all NEXT_PUBLIC_* vars automatically. Locally, export them
# before running this script.
#
# Exits 0 if all checks pass; 1 with a detailed report otherwise.

set -euo pipefail

DEPLOYED_URL="${1:?first arg must be deployed URL (e.g. https://dev.apps.transformotion.com.au)}"
ENV_EXAMPLE="${2:?second arg must be path to .env.example}"
EXPECTED_HASH="${3:?third arg must be expected commit hash}"

# Strip trailing slash from URL if present.
DEPLOYED_URL="${DEPLOYED_URL%/}"

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "ERROR: $ENV_EXAMPLE does not exist" >&2
  exit 1
fi

echo "Verifying deployment at $DEPLOYED_URL..."
echo "Expected commit hash: $EXPECTED_HASH"
echo

# ── Check 1: root document returns 200 ────────────────────────────────────────
echo "[1/3] Probing root document..."
root_code=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYED_URL/")
if [[ "$root_code" != "200" ]]; then
  echo "FAIL: root document returned HTTP $root_code (expected 200)" >&2
  exit 1
fi
echo "      OK: root returns 200"
echo

# Fetch root HTML once; extract chunk paths.
root_html=$(curl -s "$DEPLOYED_URL/")
chunk_paths=$(echo "$root_html" | grep -oE '_next/static/chunks/[^"]+\.js' | sort -u)
if [[ -z "$chunk_paths" ]]; then
  echo "FAIL: no JS chunks found in root HTML" >&2
  exit 1
fi
chunk_count=$(echo "$chunk_paths" | wc -l | tr -d ' ')
echo "[info] Found $chunk_count JS chunks in root HTML"
echo

# Fetch all chunks once; verify each is reachable; concatenate contents.
all_chunks=""
while IFS= read -r chunk; do
  chunk_code=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYED_URL/$chunk")
  if [[ "$chunk_code" != "200" ]]; then
    echo "FAIL: chunk $chunk returned HTTP $chunk_code (expected 200)" >&2
    exit 1
  fi
  all_chunks="${all_chunks}$(curl -s "$DEPLOYED_URL/$chunk")"
done <<< "$chunk_paths"
echo "[info] All $chunk_count chunks reachable"
echo

# ── Check 2: commit hash present in the deployed artefact ─────────────────────
echo "[2/3] Checking commit hash presence..."
if echo "${root_html}${all_chunks}" | grep -qF "$EXPECTED_HASH"; then
  echo "      OK: commit hash $EXPECTED_HASH found in deployed artefact"
else
  cat >&2 <<EOF

FAIL: commit hash $EXPECTED_HASH NOT found in deployed artefact.

This means the deployed bundle does not match the commit that triggered
the deploy. Possible causes:
  - NEXT_PUBLIC_COMMIT_HASH was not set during the build step
  - lib/build-info.ts is not imported into the bundle (tree-shaken)
  - S3 sync did not upload the new bundle (a dry-run or partial upload)
  - CloudFront is serving stale cached content (invalidation failed or
    the CDN TTL has not expired yet — retry after a few minutes)

EOF
  exit 1
fi
echo

# ── Check 3: every [REQUIRED] NEXT_PUBLIC_* var was substituted ───────────────
echo "[3/3] Checking [REQUIRED] var substitution in bundle..."

required_vars=()
current_tag=""
while IFS= read -r line; do
  if [[ "$line" =~ ^[[:space:]]*#[[:space:]]+\[REQUIRED\][[:space:]]*$ ]]; then
    current_tag="REQUIRED"
  elif [[ "$line" =~ ^[[:space:]]*#[[:space:]]+\[OPTIONAL\][[:space:]]*$ ]]; then
    current_tag="OPTIONAL"
  elif [[ "$line" =~ ^[[:space:]]*#[[:space:]]+\[PLANNED\][[:space:]]*$ ]]; then
    current_tag="PLANNED"
  elif [[ "$line" =~ ^[[:space:]]*#[[:space:]]+\[BUILD-INJECTED\][[:space:]]*$ ]]; then
    current_tag="BUILD-INJECTED"
  elif [[ "$line" =~ ^[A-Z_][A-Z0-9_]*= ]]; then
    if [[ "$current_tag" == "REQUIRED" && "$line" =~ ^NEXT_PUBLIC_ ]]; then
      varname="${line%%=*}"
      required_vars+=("$varname")
    fi
    current_tag=""
  elif [[ -z "$line" ]]; then
    current_tag=""
  fi
done < "$ENV_EXAMPLE"

echo "      Checking ${#required_vars[@]} [REQUIRED] NEXT_PUBLIC_* vars for build-time substitution"

missing_substitution=()
skipped_vars=()
for var in "${required_vars[@]}"; do
  value="${!var:-}"
  if [[ -z "$value" ]]; then
    skipped_vars+=("$var")
    continue
  fi
  if echo "$all_chunks" | grep -qF "$value"; then
    :
  else
    missing_substitution+=("$var")
  fi
done

if [[ ${#skipped_vars[@]} -gt 0 ]]; then
  echo "      WARN: ${#skipped_vars[@]} var(s) not set in script env — substitution not verified:" >&2
  for var in "${skipped_vars[@]}"; do
    echo "        - $var" >&2
  done
fi

if [[ ${#missing_substitution[@]} -gt 0 ]]; then
  cat >&2 <<EOF

FAIL: ${#missing_substitution[@]} [REQUIRED] var(s) have values that do NOT appear
in the deployed bundle as string literals:

EOF
  for var in "${missing_substitution[@]}"; do
    echo "  - $var" >&2
  done
  cat >&2 <<EOF

This means the build step did not substitute these vars into the bundle.
The job-level env block may be missing variables, or the variable was
added to .env.example as [REQUIRED] without being added to the workflow.
(See PR #26 — this is the build-block-drift class of bug.)

EOF
  exit 1
fi

echo "      OK: all checked [REQUIRED] var values found in bundle"
echo

# ── Summary ───────────────────────────────────────────────────────────────────
echo "=============================================="
echo "DEPLOY VERIFICATION PASSED"
echo "  URL:     $DEPLOYED_URL"
echo "  Commit:  $EXPECTED_HASH"
echo "  Chunks:  $chunk_count"
echo "  REQUIRED vars substituted: ${#required_vars[@]}"
echo "=============================================="
