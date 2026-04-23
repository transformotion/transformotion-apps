# Post-deploy checklist — Sub-phase 7b.5-alpha

This PR replaces Cognito app clients with three distinct clients
(Launchpad, Stock Analyser, Budget Tracker). CloudFormation destroys
two old clients and creates three new ones. All existing sessions are
invalidated. No active users — zero real-world impact.

## Sequence

Run immediately after deploy-platform.yml successfully deploys
TransformotionDev-Auth.

### 1. Sync Cognito client IDs to GitHub env vars

    bash scripts/ci/sync-cognito-client-ids.sh dev

### 2. Trigger app redeploys

    gh workflow run deploy-stock-analyser.yml --ref develop
    gh workflow run deploy-budget-tracker.yml --ref develop

Launchpad deploy workflow doesn't exist yet (sub-phase 7e).

### 3. Smoke test sign-in

Visit https://dev.apps.transformotion.com.au/. Sign in. Navigate
to each app via launchpad tile; should not re-prompt for auth.

If SSO prompts re-auth on any app: check callback URLs on that
client and the session cookie domain on the Hosted UI.

### 4. Delete this file

Once checklist is complete, delete this file on develop via a
small docs PR.
