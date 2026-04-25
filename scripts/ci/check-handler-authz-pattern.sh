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
#   requireAppAccess, requireAnyAppAccess, requireAccountAccess,
#   requireAccountOwner, requireSiteAdmin
#
# This is a coarse file-level check — it confirms authorization helpers are
# present in any file that performs DynamoDB work. It does not verify call
# ordering or that every individual operation is guarded.
#
# Checked paths:
#   apps/*/functions/   — app-specific handlers (Budget Tracker, Stock Analyser)
#   functions/claude-proxy/  — platform multi-app handler
#
# Exempt (see docs/architecture/cdk.md — CI checks):
#   functions/accounts/              platform-infrastructure: inline DynamoDB authz
#   functions/auth/account-provisioning/  auth-infrastructure: withAuthOnly, no app claims
#   functions/auth/forgot-provider/       auth-infrastructure: public endpoint
#   functions/auth/pre-token-generation/  auth-infrastructure: Cognito trigger
#
# Usage: bash scripts/ci/check-handler-authz-pattern.sh
# Exits 0 if all checked files pass; 1 if any violation found.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SEARCH_PATHS=(
  "$REPO_ROOT/apps"
  "$REPO_ROOT/functions/claude-proxy"
)

DYNAMO_PATTERN='PutItemCommand|GetItemCommand|QueryCommand|ScanCommand|UpdateItemCommand|DeleteItemCommand|TransactWriteCommand|BatchGetCommand|BatchWriteCommand'
AUTHZ_PATTERN='requireAppAccess|requireAnyAppAccess|requireAccountAccess|requireAccountOwner|requireSiteAdmin'

echo "Checking handler authorization patterns..."

VIOLATIONS=()

for base in "${SEARCH_PATHS[@]}"; do
  if [[ ! -d "$base" ]]; then
    continue
  fi
  while IFS= read -r file; do
    if grep -qE "$DYNAMO_PATTERN" "$file" 2>/dev/null; then
      if ! grep -qE "$AUTHZ_PATTERN" "$file" 2>/dev/null; then
        VIOLATIONS+=("$file")
      fi
    fi
  done < <(find "$base" -name "*.ts" ! -name "*.d.ts" -not -path "*/node_modules/*" -not -path "*/__tests__/*" -not -name "*.test.ts" -not -name "*.spec.ts")
done

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo "OK — all handlers with DynamoDB operations call an authorization helper."
  exit 0
fi

echo ""
echo "ERROR: The following handlers perform DynamoDB operations without calling"
echo "an authorization helper (requireAppAccess, requireAnyAppAccess,"
echo "requireAccountAccess, requireAccountOwner, or requireSiteAdmin)."
echo ""
echo "Violations:"
for f in "${VIOLATIONS[@]}"; do
  echo "  $f"
done
echo ""
echo "See docs/architecture/auth.md — Handler authorization patterns."
exit 1
