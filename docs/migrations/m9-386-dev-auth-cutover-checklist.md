# M9 #386 Dev Auth Cutover Checklist

This checklist records how dev moved from Platform-owned auth to the
Launchpad-owned auth stack and defines validation expectations for future
auth-domain changes.

## Current Post-Cutover State

Dev is cut over to LaunchpadAuth. `LAUNCHPAD_AUTH_CUTOVER_ENABLED` and the
Platform-auth false mode were removed after successful cutover validation.
Launchpad, Stock Analyser, Budget Tracker, PlatformWs while retained, and
Migration Utilities now resolve auth through LaunchpadAuth outputs.

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

Dev cutover validation completed:

- `deploy-launchpad.yml` succeeded with dev cutover enabled.
- `deploy-stock-analyser.yml` succeeded with dev cutover enabled.
- `deploy-budget-tracker.yml` succeeded with dev cutover enabled.
- `validate-auth-domain-readiness.mjs --expect-cutover enabled` passed.
- Launchpad Hosted UI login/logout probes passed.
- Launchpad control-plane routes validated: auth lookup, account setup,
  profile, preferences, account read, member list, account creation, and
  invitation creation against a smoke-owned account.
- Stock Analyser authenticated REST smoke passed with LaunchpadAuth token.
- Budget Tracker authenticated REST smoke passed with LaunchpadAuth token.
- Stock Analyser and Budget Tracker WSS connect/init/disconnect paths passed
  with LaunchpadAuth tokens.
- Platform AuthStack, Platform AuthApi, Platform auth tables, Platform
  pre-token trigger, PlatformWs, and legacy control-plane routes were not
  removed during the initial cutover. They were removed by the final #386
  Platform auth decommission work.

Operational note: the live API Gateway REST stages were explicitly redeployed
during the first dev cutover because authorizer/table wiring changed while the
stage deployments were still pointing at older deployment snapshots. If a
future auth-domain cutover changes REST authorizers and returns unexpected
401s while `test-invoke-authorizer` succeeds, force a new stage deployment or
make a no-op API Gateway deployment change in CDK before continuing.

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

PR 6 added cutover wiring. After validation, the false-mode fallback was
removed. Synthesized Launchpad, Stock Analyser, Budget Tracker, PlatformWs
while retained, and migration utilities stacks import
`TransformotionDev-LaunchpadAuth` outputs for auth authorizers and Launchpad
control-plane table references.

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

Stock Analyser and Budget Tracker CDK entrypoints resolve auth through
LaunchpadAuth exports. There is no Platform-auth false mode.

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

This checklist is a historical record of the dev cutover. After the final #386
Platform auth decommission, Platform auth rollback resources are no longer the
operational rollback path. Rollback from a future LaunchpadAuth issue should
restore from the affected Launchpad stack/template revision or from AWS backup
where applicable, then redeploy Launchpad, Stock Analyser, and Budget Tracker
as needed.
