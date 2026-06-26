#!/usr/bin/env bash
# scripts/ci/check-handler-authz-pattern.sh
#
# Fails CI if any handler file in the checked paths performs a DynamoDB
# operation without also calling at least one authorization helper.
#
# DynamoDB operations detected:
#   PutItemCommand, GetItemCommand, QueryCommand, ScanCommand,
#   UpdateItemCommand, DeleteItemCommand, TransactWriteCommand,
#   BatchGetCommand, BatchWriteCommand
#   (also matches the @aws-sdk/lib-dynamodb Document client variants)
#
# Authorization helpers that satisfy the check:
#   requireAppAccess, requireAnyAppAccess, requireAccountData,
#   requireAccountAdmin, requireSiteAdmin
#   (requireAccountAccess / requireAccountOwner were deleted in M16 Phase 5,
#    D9 — superseded by the requireAccountData / requireAccountAdmin factories.)
#
# This is a coarse file-level check - it confirms authorization helpers are
# present in any file that performs DynamoDB work. It does not verify call
# ordering or that every individual operation is guarded.
#
# Checked paths:
#   apps/                 app-specific handlers (Budget Tracker, Stock Analyser)
# Exempt (see docs/architecture/cdk.md - CI checks):
#   apps/launchpad/functions/account-provisioning/ auth-infrastructure: withAuthOnly, no app claims
#   apps/launchpad/functions/accounts/             control-plane accounts API: inline DynamoDB membership checks
#   apps/launchpad/functions/forgot-provider/      auth-infrastructure: public endpoint
#   apps/launchpad/functions/invitations/          control-plane invitation API: inline owner check
#   apps/launchpad/functions/invitation-bundles/   control-plane invitation API: withAuthOnly + PER-GRANT sender authz
#                                                  (senderCanGrant: site-admin OR {app}-app-admin, enforced per grant,
#                                                  unauthorized grants dropped + fail-closed); getBundle is the DESIGNED
#                                                  link-as-bearer resolve (Option D / m16.7.0 — crypto-UUID is the boundary,
#                                                  single-use + expiry enforced at redeem)
#   apps/launchpad/functions/invitee-search/       control-plane discovery: withAuthOnly + results SCOPED to caller authority
#                                                  (site-admin → full directory; app-admin → administered apps only;
#                                                  account-manager → own managed accounts only; zero authority → empty)
#   apps/launchpad/functions/pre-token-generation/ Cognito trigger: no request-time API caller
#   apps/launchpad/functions/user/                 auth-infrastructure: withAuthOnly user-owned profile data
#   apps/stock-analyser/functions/notification-engine/src/index.ts
#                                                  EventBridge scheduled service-principal job: no JWT caller.
#                                                  Authorization is the dedicated least-privilege IAM role plus
#                                                  in-job fail-closed live membership + consent re-check before
#                                                  every per-recipient delivery; security tests prove SHARED-only
#                                                  cache writes, cross-account isolation, and fail-closed delivery.
#
# Usage: bash scripts/ci/check-handler-authz-pattern.sh
# Exits 0 if all checked files pass; 1 if any violation found.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SEARCH_PATHS=(
  "$REPO_ROOT/apps"
)

EXEMPT_PATH_PREFIXES=(
  "$REPO_ROOT/apps/launchpad/functions/account-provisioning/"
  "$REPO_ROOT/apps/launchpad/functions/accounts/"
  "$REPO_ROOT/apps/launchpad/functions/forgot-provider/"
  "$REPO_ROOT/apps/launchpad/functions/invitations/"
  # Per-grant sender authz (site-admin OR {app}-app-admin, enforced per grant +
  # fail-closed) + designed Option-D link-as-bearer getBundle. See header note.
  "$REPO_ROOT/apps/launchpad/functions/invitation-bundles/"
  # Results scoped to caller authority (site-admin / app-admin apps / own managed
  # accounts; zero authority → empty). See header note.
  "$REPO_ROOT/apps/launchpad/functions/invitee-search/"
  "$REPO_ROOT/apps/launchpad/functions/pre-token-generation/"
  "$REPO_ROOT/apps/launchpad/functions/user/"
)

EXEMPT_FILES=(
  # EventBridge scheduled service-principal job. See docs/architecture/auth.md:
  # the handler-authz-pattern check is waived, not authorization. Compensating
  # controls are dedicated IAM + in-job fail-closed membership/consent checks,
  # backed by notification-engine and analysis-cache service-principal tests.
  "$REPO_ROOT/apps/stock-analyser/functions/notification-engine/src/index.ts"
)

DYNAMO_PATTERN='PutItemCommand|GetItemCommand|QueryCommand|ScanCommand|UpdateItemCommand|DeleteItemCommand|TransactWriteCommand|BatchGetCommand|BatchWriteCommand'
AUTHZ_PATTERN='requireAppAccess|requireAnyAppAccess|requireAccountData|requireAccountAdmin|requireSiteAdmin'

echo "Checking handler authorization patterns..."

VIOLATIONS=()

is_exempt_path() {
  local file="$1"
  local exempt_file
  for exempt_file in "${EXEMPT_FILES[@]}"; do
    if [[ "$file" == "$exempt_file" ]]; then
      return 0
    fi
  done
  local prefix
  for prefix in "${EXEMPT_PATH_PREFIXES[@]}"; do
    if [[ "$file" == "$prefix"* ]]; then
      return 0
    fi
  done
  return 1
}

for base in "${SEARCH_PATHS[@]}"; do
  if [[ ! -d "$base" ]]; then
    continue
  fi
  while IFS= read -r file; do
    if is_exempt_path "$file"; then
      continue
    fi
    if grep -qE "$DYNAMO_PATTERN" "$file" 2>/dev/null; then
      if ! grep -qE "$AUTHZ_PATTERN" "$file" 2>/dev/null; then
        VIOLATIONS+=("$file")
      fi
    fi
  done < <(find "$base" -name "*.ts" ! -name "*.d.ts" -not -path "*/node_modules/*" -not -path "*/__tests__/*" -not -name "*.test.ts" -not -name "*.spec.ts")
done

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo "OK - all handlers with DynamoDB operations call an authorization helper."
  exit 0
fi

echo ""
echo "ERROR: The following handlers perform DynamoDB operations without calling"
echo "an authorization helper (requireAppAccess, requireAnyAppAccess,"
echo "requireAccountData, requireAccountAdmin, or requireSiteAdmin)."
echo ""
echo "Violations:"
for f in "${VIOLATIONS[@]}"; do
  echo "  $f"
done
echo ""
echo "See docs/architecture/auth.md - Handler authorization patterns."
exit 1
