# Transformotion Apps — Monorepo Guide

## Structure

```
transformotion-apps/
├── apps/
│   ├── stock-analyser/           # Stock Analyser Next.js app — basePath /stock-signal
│   │   ├── app/                  # Next.js App Router pages
│   │   ├── components/           # React components
│   │   ├── contracts/            # Stock Analyser interface contracts
│   │   ├── functions/            # Stock Analyser Lambda source
│   │   │   ├── portfolio/
│   │   │   ├── watchlist/
│   │   │   ├── analysis-cache/
│   │   │   └── cycle-check/
│   │   ├── lib/                  # Domain logic, services, adaptors
│   │   ├── stores/               # Zustand stores
│   │   └── package.json          # @transformotion/stock-analyser
│   ├── budget-tracker/           # Budget Tracker app — basePath /budget-tracker
│   │   ├── functions/            # Budget Tracker Lambda source
│   │   └── package.json          # @transformotion/budget-tracker
│   └── launchpad/                # Launchpad shell app — serves /, /sign-in/, /launchpad/
│       └── package.json          # @transformotion/launchpad (planned — not yet deployed)
│
├── packages/                      # Shared code — imported by any app
│   ├── auth-client/               # Auth interface types (@transformotion/auth-client)
│   ├── api-client/                # HTTP client utilities (@transformotion/api-client)
│   ├── lambda-middleware/         # Lambda handler middleware (@transformotion/lambda-middleware)
│   ├── cycle-engine/              # Market cycle computation (@transformotion/cycle-engine)
│   └── ui/                        # Shared React components (@transformotion/ui — stub)
│
├── infrastructure/                 # AWS CDK — all environments
│   ├── lib/
│   │   ├── platform/              # Platform stacks (Cognito, S3/CF, API GW, tables)
│   │   │   ├── auth-stack.ts
│   │   │   ├── auth-api-stack.ts
│   │   │   ├── network-stack.ts
│   │   │   ├── platform-api-stack.ts
│   │   │   └── platform-tables-stack.ts
│   │   ├── stock-analyser/        # Stock Analyser-specific stacks
│   │   │   ├── stock-analyser-api-stack.ts
│   │   │   └── stock-analyser-tables-stack.ts
│   │   └── budget-tracker/        # Budget Tracker-specific stacks
│   │       ├── budget-tracker-api-stack.ts
│   │       └── budget-tracker-tables-stack.ts
│   └── bin/app.ts                 # CDK app entry — instantiates all stacks
│
├── functions/                      # Platform Lambda source (shared across apps)
│   ├── first-login/
│   ├── user/
│   ├── accounts/
│   ├── invitations/
│   ├── forgot-provider/
│   ├── claude-proxy/
│   └── pre-token-generation/      # Cognito pre-token trigger (added in sub-phase 7e)
│
├── contracts/                      # Cross-app contracts only (auth, platform)
├── .github/
│   ├── workflows/
│   │   ├── deploy-platform.yml     # Triggered by infrastructure/lib/platform/** changes
│   │   ├── deploy-stock-analyser.yml # Triggered by apps/stock-analyser/** changes
│   │   ├── deploy-budget-tracker.yml # Placeholder — activates when BT is scaffolded
│   │   ├── ci.yml                  # PR typecheck + lint + CDK synth
│   │   └── cd.yml                  # Manual full-platform redeploy
│   └── CODEOWNERS
├── pnpm-workspace.yaml
└── CLAUDE.md
```

## Import rules

Cross-app imports are **forbidden** and enforced by `eslint-plugin-boundaries`.

| From | Can import from | Cannot import from |
|---|---|---|
| `apps/stock-analyser/` | `packages/*` | `apps/budget-tracker/` |
| `apps/budget-tracker/` | `packages/*` | `apps/stock-analyser/` |
| `packages/*` | Nothing outside `packages/` | `apps/*` |
| `infrastructure/*` | `functions/*` (via file paths) | `apps/*` |

**Valid imports:**
```typescript
// ✅ Stock Analyser importing from a shared package
import { AuthService } from '@transformotion/auth-client'

// ✅ Any app importing from api-client
import { ApiClient } from '@transformotion/api-client'
```

**Invalid imports — CI will fail:**
```typescript
// ❌ Stock Analyser importing from Budget Tracker
import { BudgetStore } from '../../budget-tracker/stores/use-budget-store'

// ❌ A package importing from an app
import { portfolioService } from '../../apps/stock-analyser/lib/services/portfolio'
```

## How deploys work

Push-triggered, path-filtered per app:

| Changed path | Workflow triggered |
|---|---|
| `apps/stock-analyser/**` | `deploy-stock-analyser.yml` |
| `infrastructure/lib/stock-analyser/**` | `deploy-stock-analyser.yml` |
| `apps/budget-tracker/**` | `deploy-budget-tracker.yml` |
| `infrastructure/lib/budget-tracker/**` | `deploy-budget-tracker.yml` |
| `infrastructure/lib/platform/**` | `deploy-platform.yml` |
| `infrastructure/bin/**` | `deploy-platform.yml` |
| `functions/**` | `deploy-platform.yml` |
| `packages/**` | `deploy-stock-analyser.yml` + `deploy-budget-tracker.yml` |

Changes to one app never trigger the other app's deployment.

## Adding a new app

1. Create `apps/<app-name>/` with its own `package.json` (`@transformotion/<app-name>`)
2. Add `apps/<app-name>/contracts/` with the 6 contract files (copy from budget-tracker as template)
3. Add CDK stacks in `infrastructure/lib/<app-name>/`
4. Register stacks in `infrastructure/bin/app.ts`
5. Add Lambda source at `apps/<app-name>/functions/` if needed; register in `pnpm-workspace.yaml`
6. Add a deployment workflow at `.github/workflows/deploy-<app-name>.yml`
7. Add a `CODEOWNERS` entry for `apps/<app-name>/`

## Adding a shared package

1. Create `packages/<package-name>/` with `package.json` (`@transformotion/<package-name>`)
2. Export from `src/index.ts`
3. Add to consuming app's `package.json` as `"@transformotion/<package-name>": "workspace:*"`
4. Add a `CODEOWNERS` entry for `packages/<package-name>/`

## Common gotchas

- **CDK paths**: Lambda entry paths in CDK stacks use `path.join(__dirname, '../../../apps/...')` relative to `infrastructure/lib/<subdir>/`. Double-check the depth when adding new stacks.
- **pnpm workspace globs**: `apps/*` matches direct children only. Nested workspaces (like `apps/stock-analyser/functions/*`) need explicit entries in `pnpm-workspace.yaml`.
- **Shared API Gateway**: All apps use the same API Gateway defined in `PlatformApiStack`. Each app stack receives `api` and `authoriser` as props and adds its own routes. Do not create a second API Gateway.
- **Analysis cache table**: The `platform.analysis-cache` table is shared by all apps via the claude-proxy Lambda. App-specific cache (like Stock Analyser's per-ticker analysis) lives here too — it is keyed by `accountId + cacheKey`.
