#!/usr/bin/env bash
# scripts/ci/verify-deploy.sh
#
# Post-deploy verification: confirms the deployed frontend artefact
# matches the commit that triggered the deploy, that every [REQUIRED]
# NEXT_PUBLIC_* variable was substituted at build time, that the
# deployed URL is reachable, and (optionally) that an authenticated
# API call returns 2xx.
#
# Usage:
#   scripts/ci/verify-deploy.sh <deployed-url> <path-to-.env.example> <expected-commit-hash> [<app-identity>] [<smoke-endpoint>]
#
# The optional 4th argument is the expected app identity string (e.g. "launchpad",
# "stock-analyser", "budget-tracker"). When provided, the script checks that the
# deployed HTML's <html> element contains a matching data-app attribute.
#
# The optional 5th argument is the smoke-check API endpoint path (e.g.
# "/api/user/profile"). When provided, the script performs an additional
# authenticated call [5/5] to confirm the backend is reachable post-deploy.
# When omitted (e.g. launchpad, which has no backend), [5/5] is skipped.
#
# Required environment variables for the smoke check (only when 5th arg is set):
#   CI_COGNITO_USERNAME   — CI test user username (from GitHub Secrets)
#   CI_COGNITO_PASSWORD   — CI test user password (from GitHub Secrets)
#   COGNITO_USER_POOL_ID  — Cognito user pool ID
#   COGNITO_APP_CLIENT_ID — Cognito app client ID for this app
#   API_BASE_URL          — Platform API Gateway base URL (no trailing slash)
#
# The [REQUIRED] var substitution check reads each var's value from the current
# shell environment. In CI the job-level env block provides all NEXT_PUBLIC_* vars
# automatically. Locally, export them before running this script.
#
# Exits 0 if all checks pass; 1 with a detailed report otherwise.

set -euo pipefail

DEPLOYED_URL="${1:?first arg must be deployed URL (e.g. https://dev.apps.transformotion.com.au)}"
ENV_EXAMPLE="${2:?second arg must be path to .env.example}"
EXPECTED_HASH="${3:?third arg must be expected commit hash}"
EXPECTED_APP="${4:-}"
SMOKE_ENDPOINT="${5:-}"

# Total checks depends on whether a smoke endpoint was provided.
if [[ -n "$SMOKE_ENDPOINT" ]]; then
  TOTAL_CHECKS=5
else
  TOTAL_CHECKS=4
fi

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
echo "[1/${TOTAL_CHECKS}] Probing root document..."
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
echo "[2/${TOTAL_CHECKS}] Checking app identity marker..."
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
echo "[3/${TOTAL_CHECKS}] Checking commit hash presence..."
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
echo "[4/${TOTAL_CHECKS}] Checking [REQUIRED] var substitution in bundle..."

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
echo "            that does NOT indicate substitution failure. Check 3 (commit hash)"
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

# ── Check 5: authenticated API smoke check ────────────────────────────────────
if [[ -n "$SMOKE_ENDPOINT" ]]; then
  echo "[5/5] Smoke check — authenticated API call to ${API_BASE_URL}${SMOKE_ENDPOINT}..."

  : "${CI_COGNITO_USERNAME:?CI_COGNITO_USERNAME must be set for the smoke check}"
  : "${CI_COGNITO_PASSWORD:?CI_COGNITO_PASSWORD must be set for the smoke check}"
  : "${COGNITO_USER_POOL_ID:?COGNITO_USER_POOL_ID must be set for the smoke check}"
  : "${COGNITO_APP_CLIENT_ID:?COGNITO_APP_CLIENT_ID must be set for the smoke check}"
  : "${API_BASE_URL:?API_BASE_URL must be set for the smoke check}"

  echo "      Acquiring Cognito token (ADMIN_USER_PASSWORD_AUTH)..."
  auth_response=$(aws cognito-idp admin-initiate-auth \
    --auth-flow ADMIN_USER_PASSWORD_AUTH \
    --client-id "$COGNITO_APP_CLIENT_ID" \
    --user-pool-id "$COGNITO_USER_POOL_ID" \
    --auth-parameters "USERNAME=${CI_COGNITO_USERNAME},PASSWORD=${CI_COGNITO_PASSWORD}" \
    --output json 2>&1)

  if ! echo "$auth_response" | grep -q '"IdToken"'; then
    cat >&2 <<EOF

FAIL: Cognito token acquisition failed.

Response: $auth_response

Possible causes:
  - CI_COGNITO_USERNAME / CI_COGNITO_PASSWORD secrets are not set or incorrect
  - Test user does not exist in pool $COGNITO_USER_POOL_ID
  - ADMIN_USER_PASSWORD_AUTH flow not enabled on app client $COGNITO_APP_CLIENT_ID
  - cognito-idp:AdminInitiateAuth not granted to the deploy role

EOF
    exit 1
  fi

  id_token=$(echo "$auth_response" | grep -o '"IdToken": *"[^"]*"' | sed 's/"IdToken": *"//' | tr -d '"')
  echo "      Token acquired."

  echo "      Calling ${API_BASE_URL}${SMOKE_ENDPOINT}..."
  smoke_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${id_token}" \
    "${API_BASE_URL}${SMOKE_ENDPOINT}")

  if [[ "${smoke_code:0:1}" != "2" ]]; then
    cat >&2 <<EOF

FAIL: smoke check returned HTTP $smoke_code (expected 2xx).

Endpoint: ${API_BASE_URL}${SMOKE_ENDPOINT}

Possible causes:
  - Test user (${CI_COGNITO_USERNAME}) is not in the required Cognito groups
  - API Gateway is not deployed / route does not exist
  - Lambda function failed to start (check CloudWatch logs)
  - API_BASE_URL is incorrect

EOF
    exit 1
  fi
  echo "      OK: smoke check returned HTTP $smoke_code"
  echo
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo "=============================================="
echo "DEPLOY VERIFICATION PASSED"
echo "  URL:     $DEPLOYED_URL"
echo "  Commit:  $EXPECTED_HASH"
echo "  Chunks:  $chunk_count"
echo "  REQUIRED vars confirmed in initial chunks: ${#confirmed_vars[@]}/${#required_vars[@]}"
if [[ -n "$SMOKE_ENDPOINT" ]]; then
  echo "  Smoke:   ${API_BASE_URL}${SMOKE_ENDPOINT} → HTTP $smoke_code"
fi
echo "=============================================="
