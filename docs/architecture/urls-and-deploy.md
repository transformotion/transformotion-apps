# URL routing and deployment

## URL model

Path-based, single CloudFront distribution serving all apps at:
- **Dev:** `dev.apps.transformotion.com.au`
- **Prod:** `apps.transformotion.com.au`

| Path prefix | App | Notes |
|---|---|---|
| `/` | apps/launchpad | Root redirects to `/launchpad/` (authenticated) or `/sign-in/` (unauthenticated) |
| `/sign-in/*` | apps/launchpad | Sign-in and OAuth callback routes |
| `/launchpad/*` | apps/launchpad | Authenticated launchpad UI, app tile navigation |
| `/stock-analyser/*` | apps/stock-analyser | Stock Signal Analyser |
| `/budget-tracker/*` | apps/budget-tracker | Budget Tracker |

> **Launchpad auth path coupling:** `/sign-in/` and `/signed-out/` are Launchpad-owned routes. SA and BT use them as fallback values in `lib/config/index.ts` when `NEXT_PUBLIC_SIGNIN_URL` / `NEXT_PUBLIC_SIGNOUT_URL` are unset (local dev). If Launchpad renames these routes, SA and BT `lib/config/index.ts` need coordinated updates.

---

## Next.js basePath per app

Each app's `next.config.mjs` sets `basePath` to match its serving path:

| App | basePath | Static export path |
|---|---|---|
| `apps/launchpad` | *(none — serves at root)* | `out/` |
| `apps/stock-analyser` | `/stock-analyser` | `out/stock-analyser/` |
| `apps/budget-tracker` | `/budget-tracker` | `out/budget-tracker/` |

All apps use `output: 'export'` (Next.js static export) and `trailingSlash: true`.

---

## S3 bucket layout

Single S3 bucket: `transformotion-web-{stage}-959516291617`

Target layout after all apps are deployed:

```
bucket/
  index.html                        ← launchpad root
  _next/                            ← launchpad assets
  sign-in/
    index.html
    ...
  launchpad/
    index.html
    ...
  stock-analyser/
    index.html
    _next/                          ← stock-analyser assets
    ...
  budget-tracker/
    index.html
    _next/                          ← budget-tracker assets
    ...
```

Deploy workflows sync to their respective prefix only. No deploy syncs the bucket root with `--delete` across the entire bucket — that would wipe other apps' artefacts.

Correct S3 sync pattern per app:
```bash
# Stock Analyser
aws s3 sync apps/stock-analyser/out/stock-analyser s3://${BUCKET}/stock-analyser --delete

# Budget Tracker
aws s3 sync apps/budget-tracker/out/budget-tracker s3://${BUCKET}/budget-tracker --delete

# Launchpad (syncs root, must NOT use --delete on full bucket)
aws s3 sync apps/launchpad/out s3://${BUCKET}/ --delete --exclude "stock-analyser/*" --exclude "budget-tracker/*"
```

---

## CloudFront distribution

Single distribution (`TransformotionDev-Network` / `TransformotionProd-Network`), configured in `NetworkStack`.

- **Origin:** S3 bucket with Origin Access Control
- **Default root object:** `index.html`
- **HTTPS:** redirect all HTTP to HTTPS
- **Error responses:** 403 and 404 serve `/index.html` (SPA fallback)
- **Caching:** `CachingOptimized` policy (default behavior)
- **Compression:** enabled

### Sub-app index rewrite pattern

**Rule: Every sub-app deployed to a nested S3 prefix MUST have its own CloudFront `additionalBehaviors` entry with the `SubAppIndexRewrite` function association. Without this entry, requests for the sub-app's path fall through to the default behavior's SPA fallback (403 → `/index.html`), which serves whichever app currently occupies the S3 root (currently stock-analyser, transitionally). This produces a silent routing failure where the user sees the wrong app's HTML for their requested URL.** This rule was established by M6 #154 (PR #194, budget-tracker) and relearned for launchpad (M6 #155 follow-up). Future sub-app extractions in M7 must follow it.

Sub-apps deployed to nested S3 prefixes (e.g. `/budget-tracker/*` → `s3://bucket/budget-tracker/*`) hit a routing failure at the CloudFront/S3 boundary: a request for `/budget-tracker/` asks S3 for the object key `budget-tracker/` (with trailing slash). S3's OAC REST API returns 403 for this key (no object exists at that key), triggering the default behavior's SPA fallback to the root `/index.html`.

The fix is a CloudFront Function (`SubAppIndexRewrite`) attached to each sub-app cache behavior on the `VIEWER_REQUEST` event. The function rewrites directory requests to append `index.html` before they reach S3:

```javascript
function handler(event) {
  var request = event.request;
  if (request.uri.endsWith('/')) {
    request.uri += 'index.html';
  }
  return request;
}
```

The function is path-agnostic and shared by every sub-app behavior. Each sub-app adds an `additionalBehaviors` entry in `NetworkStack` referencing the same function instance. Implemented for `/budget-tracker/*` in M6 #154 (PR #194), `/launchpad/*` in M6 #155 follow-up, and `/stock-analyser/*` in M7 #251.

### Current state

Implemented behaviors with `SubAppIndexRewrite` — all active as of M7 #251 (verified 2026-05-21):

- `/budget-tracker/*` — M6 #154 (PR #194)
- `/stock-analyser/*` — M7 #251; prefix renamed `stock-signal` → `stock-analyser` in #286
- Launchpad at root — serves via the default behavior (no `SubAppIndexRewrite` needed for the root occupant)

---

## Deploy triggers

Deploy ordering uses independently triggered workflows. Platform changes deploy
platform substrate only; application and migration utility workflows deploy
their own stacks/assets through app-specific path filters or explicit
`workflow_dispatch`. The manual `cd.yml` workflow remains the full redeploy
escape hatch when an operator intentionally wants to redeploy everything.

### Platform (fires on push)

`deploy-platform.yml` triggers on push to `develop` or `main` when any of these paths change:
- `platform/infrastructure/**`, `infrastructure/bin/platform.ts`, `platform/functions/**`

Also triggerable via `workflow_dispatch` with `target: dev | prod`.

Deploys platform CDK stacks (`--app bin/platform.ts`): GithubActionsRole,
Storage, Network, Auth, AuthApi, PlatformTables, PlatformWs, Api (dev + prod).
It does not call Launchpad, Stock Analyser, Budget Tracker, or migration utility
deployment workflows.

`Auth`, `AuthApi`, and `PlatformTables` still contain physical auth-domain
resources after #363. That is migration debt retained for compatibility and
rollback. #386 owns the physical re-home into Launchpad; Platform ownership of
those resources is not the target architecture.

### Independent app and utility workflows

App and utility workflows are path-filtered and independently deploy only their
own stacks/assets. A push to `apps/stock-analyser/**` or
`infrastructure/bin/stock-analyser.ts` fires `deploy-stock-analyser.yml`
directly, without going through the platform workflow.

| Workflow | Push paths |
|---|---|
| `deploy-stock-analyser.yml` | `apps/stock-analyser/**`, `infrastructure/bin/stock-analyser.ts`, `packages/api-client/**`, `packages/cache/**`, `packages/data-access/**`, `packages/logger/**`, `packages/ui/**`, `packages/auth-client/**`, `packages/runtime-config/**`, `packages/lambda-middleware/**` |
| `deploy-budget-tracker.yml` | `apps/budget-tracker/**`, `infrastructure/bin/budget-tracker.ts`, `packages/api-client/**`, `packages/cache/**`, `packages/data-access/**`, `packages/logger/**`, `packages/ui/**`, `packages/auth-client/**`, `packages/runtime-config/**`, `packages/lambda-middleware/**`, `packages/budget-domain/**` |
| `deploy-migration-utilities.yml` | `migration-utilities/**`, `infrastructure/bin/migration-utilities.ts`, `packages/**` |
| `deploy-launchpad.yml` | `.github/workflows/deploy-launchpad.yml`, `apps/launchpad/**`, `infrastructure/bin/launchpad.ts`, `infrastructure/lib/**`, `platform/config/app-registry.json`, `packages/auth-client/**`, `packages/lambda-middleware/**`, `packages/runtime-config/**` |

### Manual deploys (workflow_dispatch)

All deploy workflows retain `workflow_dispatch` as the operator escape hatch.
Use it to deploy a single app without triggering a platform deploy:
```bash
gh workflow run deploy-budget-tracker.yml --ref develop -f target=dev
```

Each CDK deploy step passes an explicit `--app` flag pointing to the per-app entrypoint, so each workflow synthesises only its own stacks:

- `deploy-stock-analyser.yml` — `StockAnalyserTables`, `StockAnalyserWs`, and `StockAnalyserApi` only
- `deploy-budget-tracker.yml` — `BudgetTrackerTables`, `BudgetTrackerWs`, and `BudgetTrackerApi` only
- `deploy-migration-utilities.yml` — `MigrationsApi` only
- `deploy-launchpad.yml` - all `Transformotion{Stage}-Launchpad*` stacks + static export. This lane owns current and future Launchpad auth/control-plane backend infrastructure, including #386 auth-domain stacks.
- `deploy-platform.yml` - platform stacks only (Network, Auth, AuthApi, PlatformTables, Api, PlatformWs, Storage, GithubActionsRole). Auth-domain stacks here are current migration debt, not target ownership
- `cd.yml` - explicit manual full redeploy when an operator wants to redeploy all stacks

Changing `packages/runtime-config` does not trigger a platform deploy (the APPS const was removed from that package in M7 / #346; app identity is now sourced from `platform/config/app-registry.json` at synth time).

---

## Environment variables

Per-app deploys require these variables set in the GitHub environment (`dev` or `prod`):

### Shared across apps

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Cognito user pool ID (e.g. `ap-southeast-2_7QhxUvefw`) |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Hosted UI domain (e.g. `transformotion-959516291617-dev.auth.ap-southeast-2.amazoncognito.com`) |
| `NEXT_PUBLIC_APP_URL` | App root URL (e.g. `https://dev.apps.transformotion.com.au`) |
| `NEXT_PUBLIC_API_BASE_URL` | Platform API base URL |

### Per-app client IDs

| Variable | Client |
|---|---|
| `NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID` | LaunchpadAppClient |
| `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` | StockAnalyserAppClient |
| `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` | BudgetTrackerAppClient |

### Launchpad

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL` | `ControlPlaneApiUrl` output from `Transformotion{Stage}-LaunchpadControlPlane`; live base URL for Launchpad control-plane routes including auth lookup, account setup, user profile/preferences, account administration, member management, and invitations |
| `NEXT_PUBLIC_PLATFORM_AUTH_API_URL` | Optional rollback-only base URL for legacy platform AuthApi lookup-provider route |
| `NEXT_PUBLIC_PLATFORM_API_URL` | Optional rollback-only base URL for legacy platform API account setup, user profile/preferences, account administration, member-management, and invitation routes |

`deploy-launchpad.yml` extracts Launchpad stack outputs after CDK deploy. It
requires `ControlPlaneApiUrl` from `LaunchpadControlPlane` and reads staged
`Transformotion{Stage}-LaunchpadAuth` outputs for `UserPoolId`,
`LaunchpadAppClientId`, and `CognitoDomain` when cutover is explicitly enabled.
For dev, the `deploy-dev` job sets `LAUNCHPAD_AUTH_CUTOVER_ENABLED=true` after
staged LaunchpadAuth deployment, reseed, Hosted UI validation, and claim
validation. The workflow-level default remains `false`, so prod continues to
fall back to the environment-scoped Platform AuthStack Cognito variables until
its own cutover. Platform deploy must not source, build, or orchestrate these
Launchpad frontend auth values.

The same guard is also read by the Launchpad, Stock Analyser, and Budget
Tracker CDK entrypoints. `false` synthesizes the current Platform-auth wiring;
`true` synthesizes app/control-plane authorizers and Launchpad control-plane
table references against `Transformotion{Stage}-LaunchpadAuth` outputs. The
guard must be flipped only in an explicit #386 cutover PR.

Stock Analyser and Budget Tracker do not automatically consume
`LaunchpadAuth` outputs from the Launchpad workflow. During cutover, sync the
Launchpad-owned auth outputs into GitHub environment variables with
`scripts/ci/sync-launchpad-auth-client-ids.sh dev`, then redeploy SA and BT so
their static bundles and app-owned API/WSS authorizers use the new User Pool,
app clients, and Hosted UI domain.
The full dev sequence is documented in
[`m9-386-dev-auth-cutover-checklist.md`](../migrations/m9-386-dev-auth-cutover-checklist.md).

Client IDs are synced from CloudFormation outputs after each auth stack deploy by running:
```bash
bash scripts/ci/sync-cognito-client-ids.sh dev
```

### Build-injected

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_COMMIT_HASH` | Set by CI to `${{ github.sha }}` |

The deploy verification script (`scripts/ci/verify-deploy.sh`) checks that the commit hash appears in the deployed bundle.

---

## API Gateway URLs

| Gateway | Purpose | Name |
|---|---|---|
| `transformotion-api-{stage}` | All app routes (SA, BT, MU) + platform routes | `TransformotionDev-Api` stack output |

---

## Cognito OAuth callback flow

1. App redirects to Cognito Hosted UI with `client_id`, `redirect_uri`, `state`, `code_challenge`
2. User authenticates (email/password or social IDP)
3. Cognito redirects to `{redirect_uri}?code=...&state=...`
4. App exchanges `code` for tokens at the Hosted UI token endpoint
5. ID token contains standard claims + custom claims injected by pre-token Lambda

`redirect_uri` must exactly match one of the configured callback URLs for the app client. Mismatches cause `redirect_mismatch` errors from Cognito.
