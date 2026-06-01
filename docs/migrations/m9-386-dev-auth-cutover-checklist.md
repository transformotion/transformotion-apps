# M9 #386 Dev Auth Cutover Checklist

This checklist defines exactly how dev moves from Platform-owned auth to the
Launchpad-owned auth stack.

Do not perform the cutover until PR 4 is merged and
`TransformotionDev-LaunchpadAuth` has deployed successfully.

## Current Guardrail

`deploy-launchpad.yml`, `deploy-stock-analyser.yml`, and
`deploy-budget-tracker.yml` keep the workflow-level default at:

```yaml
LAUNCHPAD_AUTH_CUTOVER_ENABLED: 'false'
```

For the dev cutover, each `deploy-dev` job overrides the guard to:

```yaml
LAUNCHPAD_AUTH_CUTOVER_ENABLED: 'true'
```

This intentionally cuts over dev while keeping prod on Platform AuthStack until
its own explicit cutover. While the flag is `false`, Launchpad deploys
`LaunchpadAuth` but builds the frontend with the existing Platform AuthStack
Cognito environment values.

## Dev Cutover Record

Cutover date: 2026-06-02

Deployed LaunchpadAuth identifiers validated before cutover:

- User Pool ID: `ap-southeast-2_EQPgoGWzh`
- Launchpad app client ID: `6nvfrvjkdl4dneep6abnvist24`
- Stock Analyser app client ID: `2cjrub2lhr48bo1a0anmjgki6e`
- Budget Tracker app client ID: `4t401bvi9qeiosd624ep54af4a`
- Cognito domain:
  `transformotion-launchpad-959516291617-dev.auth.ap-southeast-2.amazoncognito.com`

Pre-cutover staged validation completed:

- Staged owner user created.
- Launchpad auth tables seeded.
- Cognito groups created.
- CLI sign-in against the staged pool works.
- `launchpad-pre-token-generation-dev` executes cleanly.
- ID token claims include `site_admin = "true"`, app access for
  `stock-analyser` and `budget-tracker`, and both seeded owner memberships.

## Preparation Already Front-Loaded

PR 4 prepares the safe staged pieces before live cutover:

- `TransformotionDev-LaunchpadAuth` creates the staged User Pool, Hosted UI
  domain, app clients, groups, Hosted UI customization, auth tables, pre-token
  trigger, and social IdP secret placeholders.
- The staged app clients include the expected dev callback and logout URLs.
- The staged pre-token trigger is attached to the staged User Pool and reads
  only Launchpad-owned tables.
- The reseed helper can create or confirm the owner user, add required Cognito
  groups, and copy owner account data into Launchpad-owned tables.
- The readiness validator can confirm outputs, groups, app client URLs, tables,
  secrets, trigger wiring, and seeded owner rows.

The PR does not pre-create live AWS data before deployment because the target
User Pool ID and table names do not exist until `LaunchpadAuth` deploys. It also
does not attach social IdP providers yet: the secret resources are staged, but
real provider credentials must be populated before provider attachment.

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
   - social IdP secret names
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

Then run the readiness validator:

```bash
node scripts/migrations/launchpad/validate-auth-domain-readiness.mjs \
  --stage dev \
  --email <owner-email>
```

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

## Phase 3A - Populate Social IdP Secrets If Needed

The staged stack creates Secrets Manager entries for Google, Facebook,
Microsoft, and Apple provider configuration. Before enabling social provider
sign-in for the Launchpad-owned User Pool, replace placeholder generated values
with real provider credentials.

Use the secret names from `TransformotionDev-LaunchpadAuth` outputs. Example:

```bash
aws secretsmanager put-secret-value \
  --secret-id /launchpad/dev/cognito/google-client-id \
  --secret-string '<google-client-id>'
```

Provider attachment is intentionally deferred until real credentials are
available. Cognito-only sign-in can be validated without this step.

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

Before flipping the workflow guard, confirm the cutover PR also switches
Launchpad control-plane infrastructure to the Launchpad-owned auth domain:

- `LaunchpadControlPlane` Cognito authorizer uses
  `TransformotionDev-LaunchpadAuth` `UserPoolId`.
- Control-plane Lambda env vars use Launchpad-owned auth tables where the route
  has moved off Platform substrate.
- `POST /auth/lookup-provider` uses the Launchpad-owned staged User Pool when
  resolving users.

PR 6 adds flag-driven cutover wiring. With
`LAUNCHPAD_AUTH_CUTOVER_ENABLED=false`, synthesized stacks keep the Platform
User Pool and `platform.*` auth tables. With
`LAUNCHPAD_AUTH_CUTOVER_ENABLED=true`, synthesized Launchpad, Stock Analyser,
and Budget Tracker stacks import `TransformotionDev-LaunchpadAuth` outputs for
auth authorizers and Launchpad control-plane table references.

Create the cutover PR that changes the dev deploy jobs from:

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

Then validate deployed Launchpad wiring:

```bash
node scripts/migrations/launchpad/validate-auth-domain-readiness.mjs \
  --stage dev \
  --email <owner-email> \
  --expect-cutover enabled
```

## Phase 6 - Redeploy SA/BT

Before syncing app client IDs or redeploying the apps, confirm the cutover PR
also updates app infrastructure auth imports:

- Stock Analyser API and WSS stacks must trust
  `TransformotionDev-LaunchpadAuth` `UserPoolId`.
- Budget Tracker API and WSS stacks must trust
  `TransformotionDev-LaunchpadAuth` `UserPoolId`.

PR 6 adds the same flag-driven auth-domain selection to the Stock Analyser and
Budget Tracker CDK entrypoints. Keep each app workflow guard at `false` until
the explicit app cutover deploy, then set it to `true` with the same cutover PR
or a tightly sequenced follow-up.

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
