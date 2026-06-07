# URL routing and deployment

## URL model

Path-based, single CloudFront distribution serving all apps at:

- **Dev:** `dev.apps.transformotion.com.au`
- **Prod:** `apps.transformotion.com.au`

| Path prefix | App | Notes |
|---|---|---|
| `/` | apps/launchpad | Root redirects to `/launchpad/` or `/sign-in/` |
| `/sign-in/*` | apps/launchpad | Sign-in and OAuth callback routes |
| `/signed-out/*` | apps/launchpad | Signed-out landing route |
| `/launchpad/*` | apps/launchpad | Authenticated Launchpad UI |
| `/stock-analyser/*` | apps/stock-analyser | Stock Signal Analyser |
| `/budget-tracker/*` | apps/budget-tracker | Budget Tracker |

`/sign-in/` and `/signed-out/` are Launchpad-owned routes. SA and BT use them
as default sign-in/sign-out targets when app-specific env vars are unset.

## Next.js basePath per app

| App | basePath | Static export path |
|---|---|---|
| `apps/launchpad` | none, root app | `out/` |
| `apps/stock-analyser` | `/stock-analyser` | `out/stock-analyser/` |
| `apps/budget-tracker` | `/budget-tracker` | `out/budget-tracker/` |

All apps use Next.js static export and trailing slashes.

## S3 bucket layout

Single web bucket: `transformotion-web-{stage}-959516291617`.

```text
bucket/
  index.html
  _next/
  sign-in/
  signed-out/
  launchpad/
  stock-analyser/
  budget-tracker/
```

Deploy workflows sync only their owned prefix. Launchpad syncs the root app and
must exclude app prefixes so it does not delete SA/BT assets.

## CloudFront distribution

Single distribution, configured in `NetworkStack`.

- Origin: S3 bucket with Origin Access Control
- HTTPS: redirect all HTTP to HTTPS
- Error responses: 403 and 404 serve `/index.html`
- Sub-app index rewrites are attached to nested app prefixes

## Deploy triggers

Deploy ordering uses independently triggered workflows. Platform changes deploy
neutral substrate only. App and migration utility workflows deploy their own
stacks/assets through app-specific path filters or explicit `workflow_dispatch`.
The manual `cd.yml` workflow remains the full redeploy escape hatch.

### Platform

`deploy-platform.yml` triggers on push to `develop` or `main` when these paths
change:

- `platform/infrastructure/**`
- `infrastructure/bin/platform.ts`

It deploys:

1. `Transformotion-GithubActionsRole`
2. `Transformotion{Stage}-Storage`
3. `Transformotion{Stage}-Network`

Platform deploy does not call or orchestrate Launchpad, Stock Analyser, Budget
Tracker, migration utilities, auth-domain resources, app REST APIs, app WSS
APIs, or AI runtime.

### Independent app and utility workflows

| Workflow | Push paths |
|---|---|
| `deploy-launchpad.yml` | `.github/workflows/deploy-launchpad.yml`, `apps/launchpad/**` except documentation-only app files, `infrastructure/bin/launchpad.ts`, `infrastructure/lib/**`, `platform/config/app-registry.json`, `packages/auth-client/**`, `packages/lambda-middleware/**`, `packages/runtime-config/**` except package documentation-only files |
| `deploy-stock-analyser.yml` | `.github/workflows/deploy-stock-analyser.yml`, `apps/stock-analyser/**` except documentation-only app files, `infrastructure/bin/stock-analyser.ts`, `packages/api-client/**`, `packages/cache/**`, `packages/data-access/**`, `packages/logger/**`, `packages/ui/**`, `packages/auth-client/**`, `packages/runtime-config/**`, `packages/lambda-middleware/**`, `packages/fn-ai-proxy-core/**` except package documentation-only files |
| `deploy-budget-tracker.yml` | `.github/workflows/deploy-budget-tracker.yml`, `apps/budget-tracker/**` except documentation-only app files, `infrastructure/bin/budget-tracker.ts`, `packages/api-client/**`, `packages/cache/**`, `packages/data-access/**`, `packages/logger/**`, `packages/ui/**`, `packages/auth-client/**`, `packages/runtime-config/**`, `packages/lambda-middleware/**`, `packages/fn-ai-proxy-core/**`, `packages/budget-domain/**` except package documentation-only files |
| `deploy-migration-utilities.yml` | `.github/workflows/deploy-migration-utilities.yml`, `migration-utilities/**` except documentation-only utility files, `infrastructure/bin/migration-utilities.ts`, `packages/**` except package documentation-only files |

Documentation-only exclusions cover `AGENTS.md`, `CLAUDE.md`, `README.md`,
and `docs/**`. Contract/source files remain deploy-eligible when they are
under an included app, utility, or package path.

Each CDK deploy step passes an explicit `--app` flag pointing to the owner
entrypoint:

- `deploy-launchpad.yml` deploys all `Transformotion{Stage}-Launchpad*` stacks
  and the Launchpad frontend.
- `deploy-stock-analyser.yml` deploys Stock Analyser stacks and `/stock-analyser`
  assets.
- `deploy-budget-tracker.yml` deploys Budget Tracker stacks and
  `/budget-tracker` assets.
- `deploy-migration-utilities.yml` deploys `MigrationsApi`.
- `deploy-platform.yml` deploys platform substrate only.
- `cd.yml` is the explicit manual full redeploy workflow.

## Environment variables

Per-app deploys inject public frontend configuration from stack outputs and
GitHub environment variables.

### Shared auth frontend vars

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `Transformotion{Stage}-LaunchpadAuth` `UserPoolId` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | `Transformotion{Stage}-LaunchpadAuth` `CognitoDomain` |
| `NEXT_PUBLIC_APP_URL` | App root URL for the environment |

### App client IDs

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID` | `Transformotion{Stage}-LaunchpadAuth` `LaunchpadAppClientId` |
| `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` | `Transformotion{Stage}-LaunchpadAuth` `StockAnalyserAppClientId` |
| `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` | `Transformotion{Stage}-LaunchpadAuth` `BudgetTrackerAppClientId` |

### App API/WSS vars

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL` | `Transformotion{Stage}-LaunchpadControlPlane` `ControlPlaneApiUrl` |
| `NEXT_PUBLIC_API_URL` for Stock Analyser | `Transformotion{Stage}-StockAnalyserApi` URL output |
| `NEXT_PUBLIC_SA_WSS_URL` | `Transformotion{Stage}-StockAnalyserWs` URL output |
| `NEXT_PUBLIC_API_URL` for Budget Tracker | `Transformotion{Stage}-BudgetTrackerApi` URL output |
| `NEXT_PUBLIC_BT_WSS_URL` | `Transformotion{Stage}-BudgetTrackerWs` URL output |

Client IDs are synced from LaunchpadAuth outputs after auth stack changes:

```bash
bash scripts/ci/sync-launchpad-auth-client-ids.sh dev
```

After auth output changes, redeploy Launchpad, SA, and BT so static bundles and
app-owned API/WSS authorizers use the current LaunchpadAuth User Pool, app
clients, and Hosted UI domain.

## API Gateway URLs

| Gateway | Purpose | Owner |
|---|---|---|
| `launchpad-control-plane-{stage}` | Auth/control-plane APIs | Launchpad |
| `stock-analyser-api-{stage}` | Stock Analyser REST APIs and AI proxy route | Stock Analyser |
| `budget-tracker-api-{stage}` | Budget Tracker REST APIs | Budget Tracker |
| `migrations-api-{stage}` | Migration utility APIs | Migration utilities |

There is no live shared Platform REST API Gateway.

## Cognito OAuth callback flow

1. App redirects to Cognito Hosted UI with `client_id`, `redirect_uri`, `state`,
   and `code_challenge`.
2. Cognito authenticates the user.
3. Cognito redirects to `{redirect_uri}?code=...&state=...`.
4. The app exchanges `code` for tokens at the Hosted UI token endpoint.
5. The ID token contains standard claims plus custom claims injected by
   `launchpad-pre-token-generation-{stage}`.

`redirect_uri` must exactly match one of the configured callback URLs for the
app client. Mismatches cause `redirect_mismatch` errors from Cognito.
