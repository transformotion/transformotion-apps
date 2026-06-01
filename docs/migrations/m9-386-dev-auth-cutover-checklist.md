# M9 #386 Dev Auth Cutover Checklist

This checklist defines exactly how dev moves from Platform-owned auth to the
Launchpad-owned auth stack.

Do not perform the cutover until PR 4 is merged and
`TransformotionDev-LaunchpadAuth` has deployed successfully.

## Current Guardrail

`deploy-launchpad.yml` defaults to:

```yaml
LAUNCHPAD_AUTH_CUTOVER_ENABLED: 'false'
```

While this is `false`, Launchpad deploys `LaunchpadAuth` but builds the
frontend with the existing Platform AuthStack Cognito environment values.

## Phase 1 - Deploy Staged Auth

1. Merge the PR containing `TransformotionDev-LaunchpadAuth`.
2. Run `deploy-launchpad.yml` against `develop` with target `dev`.
3. Confirm `TransformotionDev-LaunchpadAuth` exists and outputs:
   - `UserPoolId`
   - `UserPoolArn`
   - `LaunchpadAppClientId`
   - `StockAnalyserAppClientId`
   - `BudgetTrackerAppClientId`
   - `CognitoDomain`
   - auth table names
4. Confirm `TransformotionDev-LaunchpadControlPlane` remains healthy.

No live auth has moved at this point.

## Phase 2 - Reseed Dev Data

Run the reseed helper:

```bash
node scripts/migrations/launchpad/seed-auth-domain-dev.mjs \
  --stage dev \
  --email <owner-email> \
  --temp-password '<temporary-password>'
```

Use `--dry-run` first if you want to preview writes:

```bash
node scripts/migrations/launchpad/seed-auth-domain-dev.mjs \
  --stage dev \
  --email <owner-email> \
  --dry-run
```

Validate:

- Owner user exists in the Launchpad-owned User Pool.
- Owner user belongs to:
  - `site-admin`
  - `stock-app-access`
  - `budget-app-access`
- `launchpad-users-dev` has the owner row.
- `launchpad-accounts-dev` has Stock Analyser and Budget Tracker account rows.
- `launchpad-account-members-dev` has owner memberships for both accounts.
- `launchpad-invitations-dev` and `launchpad-rate-limits-dev` can be empty.

## Phase 3 - Validate Staged Claims

Before any live cutover:

1. Sign in against the staged Launchpad-owned User Pool.
2. Confirm `launchpad-pre-token-generation-dev` is invoked in CloudWatch.
3. Inspect the ID token and confirm:
   - `site_admin` is `"true"`
   - `apps` contains `stock-analyser` and `budget-tracker`
   - `accounts` contains both seeded account memberships
4. If practical, call Launchpad control-plane authenticated routes with the
   staged token:
   - `GET /api/user/profile`
   - `POST /auth/setup`

Expected limitation before table cutover: current Launchpad control-plane
Lambdas still read the live Platform tables. This staged token validation is
primarily proving the new User Pool, app clients, groups, and pre-token claims.

## Phase 4 - Prepare App Env Vars

Sync GitHub environment variables from `TransformotionDev-LaunchpadAuth`:

```bash
bash scripts/ci/sync-launchpad-auth-client-ids.sh dev
```

This updates:

- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`
- `NEXT_PUBLIC_COGNITO_DOMAIN`
- `NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID`
- `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID`
- `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID`

Do not run this until staged claim validation has passed.

## Phase 5 - Flip Launchpad Cutover

Create the cutover PR that changes:

```yaml
LAUNCHPAD_AUTH_CUTOVER_ENABLED: 'false'
```

to:

```yaml
LAUNCHPAD_AUTH_CUTOVER_ENABLED: 'true'
```

Merge that PR, then run `deploy-launchpad.yml` for dev.

Validate the Launchpad frontend bundle contains the Launchpad-owned:

- User Pool ID
- Launchpad app client ID
- Cognito Hosted UI domain
- Control-plane API URL

## Phase 6 - Redeploy SA/BT

After GitHub environment variables point at `LaunchpadAuth`, redeploy:

```bash
gh workflow run deploy-stock-analyser.yml --ref develop -f target=dev
gh workflow run deploy-budget-tracker.yml --ref develop -f target=dev
```

Validate the app bundles contain:

- Launchpad-owned User Pool ID
- App-specific Launchpad-owned client ID
- Launchpad-owned Cognito Hosted UI domain

## Phase 7 - Runtime Smoke

Validate:

- Launchpad sign-in.
- Launchpad sign-out.
- Token refresh.
- Launchpad tile rendering.
- `POST /auth/lookup-provider`.
- `GET /api/user/profile`.
- Stock Analyser authenticated smoke.
- Budget Tracker authenticated smoke.
- Stock Analyser WSS auth connect if practical.
- Budget Tracker WSS auth connect if practical.

## Rollback

Fast rollback is:

1. Revert the cutover PR or set:

   ```yaml
   LAUNCHPAD_AUTH_CUTOVER_ENABLED: 'false'
   ```

2. Restore GitHub environment variables to the Platform AuthStack values. If
   needed, use the existing Platform helper:

   ```bash
   bash scripts/ci/sync-cognito-client-ids.sh dev
   ```

3. Redeploy Launchpad:

   ```bash
   gh workflow run deploy-launchpad.yml --ref develop -f target=dev
   ```

4. Redeploy Stock Analyser and Budget Tracker if their builds were already
   rebuilt against LaunchpadAuth values.

Old Platform AuthStack, Platform tables, Platform pre-token trigger, and legacy
rollback routes remain deployed during this cutover.
