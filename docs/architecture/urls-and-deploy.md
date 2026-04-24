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
| `/stock-signal/*` | apps/stock-analyser | Stock Signal Analyser |
| `/budget-tracker/*` | apps/budget-tracker | Budget Tracker |

---

## Next.js basePath per app

Each app's `next.config.mjs` sets `basePath` to match its serving path:

| App | basePath | Static export path |
|---|---|---|
| `apps/launchpad` | *(none — serves at root)* | `out/` |
| `apps/stock-analyser` | `/stock-signal` | `out/stock-signal/` |
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
  stock-signal/
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
aws s3 sync apps/stock-analyser/out/stock-signal s3://${BUCKET}/stock-signal --delete

# Budget Tracker
aws s3 sync apps/budget-tracker/out/budget-tracker s3://${BUCKET}/budget-tracker --delete

# Launchpad (syncs root, must NOT use --delete on full bucket)
aws s3 sync apps/launchpad/out s3://${BUCKET}/ --delete --exclude "stock-signal/*" --exclude "budget-tracker/*"
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

> **Current limitation:** The CloudFront distribution has a single default behavior with no path-based behaviors. The 403/404 error fallback serves `/index.html` (the launchpad). This means direct navigation to `/stock-signal/some-route` will correctly load the stock-analyser SPA at `/stock-signal/index.html` only if the error response for 403 is updated to be path-aware, OR if S3 serves the correct `index.html` for the path prefix.
>
> The target architecture has path-based CloudFront behaviors routing `/stock-signal/*` and `/budget-tracker/*` to their respective S3 path prefixes with per-prefix SPA fallbacks. This CDK change is part of sub-phase 7b/7g.

---

## Deploy triggers

Each app has its own path-filtered GitHub Actions deploy workflow. Workflows fire on push to `develop` (dev deploy) or `main` (prod deploy).

| Workflow | Trigger paths | What it deploys |
|---|---|---|
| `deploy-stock-analyser.yml` | `apps/stock-analyser/**`, `infrastructure/lib/stock-analyser/**`, `packages/**` | `TransformotionDev-StockAnalyserApi` CDK stack + S3 sync to `stock-signal/` |
| `deploy-budget-tracker.yml` | `apps/budget-tracker/**`, `infrastructure/lib/budget-tracker/**`, `packages/**` | `TransformotionDev-BudgetTrackerTables` + `BudgetTrackerApi` CDK stacks + S3 sync to `budget-tracker/` |
| `deploy-platform.yml` | `infrastructure/lib/platform/**`, `infrastructure/bin/**`, `functions/**` | All platform CDK stacks |

> **Note:** `deploy-platform.yml` does not trigger on `apps/**` changes, and app workflows do not trigger on `functions/**` changes. If you add a new Lambda to a platform stack and want it deployed with the app, ensure it is in `functions/` (not `apps/*/functions/`).

Changes to one app's paths never trigger another app's deployment.

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
| `transformotion-api-{stage}` | Platform + Stock Analyser routes | `TransformotionDev-Api` stack output |
| `budget-tracker-api-{stage}` | Budget Tracker routes (own gateway) | `TransformotionDev-BudgetTrackerApi` stack output |

> The Budget Tracker has its own API Gateway rather than sharing the platform gateway. This is a known architectural divergence (tracked in the Stabilisation backlog as sub-phase 7f). The separate gateway is functional; consolidation is optional.

---

## Cognito OAuth callback flow

1. App redirects to Cognito Hosted UI with `client_id`, `redirect_uri`, `state`, `code_challenge`
2. User authenticates (email/password or social IDP)
3. Cognito redirects to `{redirect_uri}?code=...&state=...`
4. App exchanges `code` for tokens at the Hosted UI token endpoint
5. ID token contains standard claims + custom claims injected by pre-token Lambda

`redirect_uri` must exactly match one of the configured callback URLs for the app client. Mismatches cause `redirect_mismatch` errors from Cognito.
