#!/usr/bin/env bash
# scripts/ci/sync-launchpad-auth-client-ids.sh
#
# Cutover helper: reads Cognito outputs from the Launchpad-owned auth stack and
# writes them to GitHub environment variables for the given stage.
#
# Run only during the explicit #386 auth cutover. Before running, deploy
# Transformotion{Stage}-LaunchpadAuth, reseed Launchpad-owned auth tables, and
# validate staged token claims.
#
# Usage:
#   bash scripts/ci/sync-launchpad-auth-client-ids.sh [dev|prod]

set -euo pipefail

STAGE="${1:-dev}"
if [[ "$STAGE" != "dev" && "$STAGE" != "prod" ]]; then
  echo "ERROR: stage must be 'dev' or 'prod'" >&2
  exit 1
fi

STAGE_CAP="$(tr '[:lower:]' '[:upper:]' <<< "${STAGE:0:1}")${STAGE:1}"
STACK_NAME="Transformotion${STAGE_CAP}-LaunchpadAuth"

echo "Reading Launchpad auth outputs from CloudFormation stack: $STACK_NAME"

fetch_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" \
    --output text
}

USER_POOL_ID="$(fetch_output UserPoolId)"
COGNITO_DOMAIN="$(fetch_output CognitoDomain)"
LAUNCHPAD_ID="$(fetch_output LaunchpadAppClientId)"
STOCK_ANALYSER_ID="$(fetch_output StockAnalyserAppClientId)"
BUDGET_TRACKER_ID="$(fetch_output BudgetTrackerAppClientId)"

if [[ -z "$USER_POOL_ID" || -z "$COGNITO_DOMAIN" || -z "$LAUNCHPAD_ID" || -z "$STOCK_ANALYSER_ID" || -z "$BUDGET_TRACKER_ID" ]]; then
  echo "ERROR: one or more LaunchpadAuth outputs were missing" >&2
  echo "  UserPoolId:       ${USER_POOL_ID:-<missing>}" >&2
  echo "  CognitoDomain:    ${COGNITO_DOMAIN:-<missing>}" >&2
  echo "  Launchpad client: ${LAUNCHPAD_ID:-<missing>}" >&2
  echo "  SA client:        ${STOCK_ANALYSER_ID:-<missing>}" >&2
  echo "  BT client:        ${BUDGET_TRACKER_ID:-<missing>}" >&2
  exit 1
fi

echo "Found:"
echo "  NEXT_PUBLIC_COGNITO_USER_POOL_ID             = $USER_POOL_ID"
echo "  NEXT_PUBLIC_COGNITO_DOMAIN                   = $COGNITO_DOMAIN"
echo "  NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID      = $LAUNCHPAD_ID"
echo "  NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID = $STOCK_ANALYSER_ID"
echo "  NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID = $BUDGET_TRACKER_ID"
echo ""
echo "Updating GitHub environment variables for stage: $STAGE"

gh variable set NEXT_PUBLIC_COGNITO_USER_POOL_ID \
  --env "$STAGE" --body "$USER_POOL_ID"
gh variable set NEXT_PUBLIC_COGNITO_DOMAIN \
  --env "$STAGE" --body "$COGNITO_DOMAIN"
gh variable set NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID \
  --env "$STAGE" --body "$LAUNCHPAD_ID"
gh variable set NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID \
  --env "$STAGE" --body "$STOCK_ANALYSER_ID"
gh variable set NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID \
  --env "$STAGE" --body "$BUDGET_TRACKER_ID"

echo ""
echo "Done. Next: enable Launchpad auth cutover and redeploy Launchpad, Stock Analyser, and Budget Tracker."
