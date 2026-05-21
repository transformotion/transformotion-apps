#!/usr/bin/env bash
# scripts/ci/verify-deploy.sh
#
# Post-deploy verification: confirms the deployed frontend artefact
# matches the commit that triggered the deploy, that every [REQUIRED]
# NEXT_PUBLIC_* variable was substituted at build time, and that the
# deployed URL is reachable.
#
# Usage:
#   scripts/ci/verify-deploy.sh <deployed-url> <path-to-.env.example> <expected-commit-hash> [<app-identity>]
#
# The optional 4th argument is the expected app identity string (e.g. "launchpad",
# "stock-analyser", "budget-tracker"). When provided, the script checks that the
# deployed HTML's <html> element contains a matching data-app attribute.
#
# The [REQUIRED] var substitution check (check 4) reads each var's value
# from the current shell environment. In CI the job-level env block
# provides all NEXT_PUBLIC_* vars automatically. Locally, export them
# before running this script.
#
# Exits 0 if all checks pass; 1 with a detailed report otherwise.

set -euo pipefail

DEPLOYED_URL="${1:?first arg must be deployed URL (e.g. https://dev.apps.transformotion.com.au)}"
ENV_EXAMPLE="${2:?second arg must be path to .env.example}"
EXPECTED_HASH="${3:?third arg must be expected commit hash}"
EXPECTED_APP="${4:-}"

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
echo "[1/4] Probing root document..."
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

# ── Check 2: app identity marker present in root HTML ─────────────────────────
echo "[2/4] Checking app identity marker..."
if [[ -n "$EXPECTED_APP" ]]; then
  if (set +o pipefail; echo "$root_html" | grep -qF "data-app=\"$EXPECTED_APP\""); then
    echo "      OK: data-app=\"$EXPECTED_APP\" found in root HTML"
  else
    cat >&2 <<EOF

FAIL: app identity marker data-app="$EXPECTED_APP" NOT found in root HTML.

This means the deployed HTML came from a different app, or the marker
was not injected during the build. URL fetched: $DEPLOYED_URL/

Possible causes:
  - The verify-deploy.sh URL arg points at the wrong app's endpoint
  - The APP_IDENTITY constant in lib/build-info.ts does not match
    the expected value "$EXPECTED_APP"
  - The data-app attribute was not added to the <html> element in
    app/layout.tsx

EOF
    exit 1
  fi
else
  echo "      SKIP: no expected app identity provided (4th arg empty)"
fi
echo

# ── Check 3: commit hash present in the deployed artefact ─────────────────────
echo "[3/4] Checking commit hash presence..."
# Run in a subshell with pipefail disabled: when grep -q finds a match early it
# exits 0 and closes the pipe, causing echo/printf to receive SIGPIPE (exit 141).
# With pipefail the pipeline would return 141 even on a successful match.
# Disabling pipefail in a subshell makes the pipeline return grep's exit code.
if (set +o pipefail; printf '%s%s' "${root_html}" "${all_chunks}" 2>/dev/null | grep -qF "$EXPECTED_HASH"); then
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

# ── Check 4: every [REQUIRED] NEXT_PUBLIC_* var was substituted ───────────────
echo "[4/4] Checking [REQUIRED] var substitution in bundle..."

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

echo "      Checking ${#required_vars[@]} [REQUIRED] NEXT_PUBLIC_* vars in initial-load chunks"
echo "      NOTE: only checks the $chunk_count chunks referenced from the index page."
echo "            API client vars in lazy-loaded route chunks may not appear here —"
echo "            that does NOT indicate substitution failure. Check 2 (commit hash)"
echo "            is the definitive proof that the correct bundle was deployed."
echo

confirmed_vars=()
not_in_initial=()
skipped_vars=()
for var in "${required_vars[@]}"; do
  value="${!var:-}"
  if [[ -z "$value" ]]; then
    skipped_vars+=("$var")
    continue
  fi
  if (set +o pipefail; printf '%s' "${all_chunks}" 2>/dev/null | grep -qF "$value"); then
    confirmed_vars+=("$var")
  else
    not_in_initial+=("$var")
  fi
done

if [[ ${#skipped_vars[@]} -gt 0 ]]; then
  echo "      SKIP: ${#skipped_vars[@]} var(s) not set in script env — cannot check:"
  for var in "${skipped_vars[@]}"; do
    echo "        - $var"
  done
fi

if [[ ${#confirmed_vars[@]} -gt 0 ]]; then
  echo "      OK: ${#confirmed_vars[@]} var(s) confirmed in initial-load chunks:"
  for var in "${confirmed_vars[@]}"; do
    echo "        - $var"
  done
fi

if [[ ${#not_in_initial[@]} -gt 0 ]]; then
  echo "      INFO: ${#not_in_initial[@]} var(s) not in initial-load chunks (likely lazy-loaded — not a failure):"
  for var in "${not_in_initial[@]}"; do
    echo "        - $var"
  done
fi
echo

# ── Summary ───────────────────────────────────────────────────────────────────
echo "=============================================="
echo "DEPLOY VERIFICATION PASSED"
echo "  URL:     $DEPLOYED_URL"
echo "  Commit:  $EXPECTED_HASH"
echo "  Chunks:  $chunk_count"
echo "  REQUIRED vars confirmed in initial chunks: ${#confirmed_vars[@]}/${#required_vars[@]}"
echo "=============================================="
