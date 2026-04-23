#!/usr/bin/env bash
# scripts/ci/sync-cognito-client-ids.sh
#
# Post-deploy script: retrieves the three Cognito client IDs from
# CloudFormation outputs and writes them to GitHub environment
# variables for the given stage.
#
# Run AFTER deploy-platform.yml completes a successful deploy that
# changed the auth stack. Idempotent.
#
# Usage:
#   bash scripts/ci/sync-cognito-client-ids.sh [dev|prod]

set -euo pipefail

STAGE="${1:-dev}"
if [[ "$STAGE" != "dev" && "$STAGE" != "prod" ]]; then
  echo "ERROR: stage must be 'dev' or 'prod'" >&2
  exit 1
fi

STAGE_CAP="$(tr '[:lower:]' '[:upper:]' <<< ${STAGE:0:1})${STAGE:1}"
STACK_NAME="Transformotion${STAGE_CAP}-Auth"

echo "Reading client IDs from CloudFormation stack: $STACK_NAME"

fetch_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" \
    --output text
}

LAUNCHPAD_ID=$(fetch_output LaunchpadAppClientId)
STOCK_ANALYSER_ID=$(fetch_output StockAnalyserAppClientId)
BUDGET_TRACKER_ID=$(fetch_output BudgetTrackerAppClientId)

if [[ -z "$LAUNCHPAD_ID" || -z "$STOCK_ANALYSER_ID" || -z "$BUDGET_TRACKER_ID" ]]; then
  echo "ERROR: one or more client IDs not found in stack outputs" >&2
  echo "  Launchpad:       ${LAUNCHPAD_ID:-<missing>}" >&2
  echo "  Stock Analyser:  ${STOCK_ANALYSER_ID:-<missing>}" >&2
  echo "  Budget Tracker:  ${BUDGET_TRACKER_ID:-<missing>}" >&2
  exit 1
fi

echo "Found:"
echo "  NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID       = $LAUNCHPAD_ID"
echo "  NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID  = $STOCK_ANALYSER_ID"
echo "  NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID  = $BUDGET_TRACKER_ID"
echo ""
echo "Updating GitHub environment variables for stage: $STAGE"

gh variable set NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID \
  --env "$STAGE" --body "$LAUNCHPAD_ID"
gh variable set NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID \
  --env "$STAGE" --body "$STOCK_ANALYSER_ID"
gh variable set NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID \
  --env "$STAGE" --body "$BUDGET_TRACKER_ID"

echo ""
echo "Done. Next: trigger redeploys of affected apps so new builds bake in the new client IDs."
echo "  gh workflow run deploy-stock-analyser.yml --ref develop"
echo "  gh workflow run deploy-budget-tracker.yml --ref develop"
echo "  (launchpad deploy workflow doesn't exist yet — sub-phase 7e)"
