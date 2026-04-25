# CDK stack topology

## Overview

AWS CDK in TypeScript at `infrastructure/`. All stacks are defined in `infrastructure/bin/app.ts`. Each environment (`dev`, `prod`) has its own set of stacks; stacks are never shared across environments.

Account ID: `959516291617`  
Region: `ap-southeast-2`

Stacks are deployed by GitHub Actions workflows — see [urls-and-deploy.md](./urls-and-deploy.md) for workflow triggers.

---

## Stack inventory

### Storage stack

`TransformotionDev-Storage` / `TransformotionProd-Storage`.

Contains the platform-level S3 buckets that are not tied to a specific app. Currently holds:

- `transformotion-backups-{account}` — dedicated bucket for one-shot backups (e.g., pre-migration data exports, configuration snapshots). Versioned, encrypted, with lifecycle rules on the `migration-backups/` prefix transitioning to Infrequent Access after 30 days and expiring after 365 days.

The Storage stack is independent of other stacks (no cross-stack exports or imports).

### Platform stacks

Deployed by `deploy-platform.yml`. Source in `infrastructure/lib/platform/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-Storage` | `StorageStack` | S3 backups bucket `transformotion-backups-{account}` for platform migrations and one-shot backups |
| `Transformotion{Stage}-Network` | `NetworkStack` | S3 bucket `transformotion-web-{stage}-959516291617`, CloudFront distribution, ACM cert wiring |
| `Transformotion{Stage}-Auth` | `AuthStack` | Cognito user pool, three app clients, Cognito groups, Secrets Manager entries for social IDP credentials, Hosted UI domain |
| `Transformotion{Stage}-AuthApi` | `AuthApiStack` | `transformotion-forgot-provider-{stage}` Lambda + its own API Gateway (public — no JWT required on `/auth/lookup-provider`) |
| `Transformotion{Stage}-PlatformTables` | `PlatformTablesStack` | `platform.users`, `platform.accounts`, `platform.account-members`, `platform.invitations` DynamoDB tables |
| `Transformotion{Stage}-Api` | `PlatformApiStack` | Shared REST API Gateway (`transformotion-api-{stage}`), Cognito JWT authoriser, platform Lambda functions (see below) |

### Stock Analyser stacks

Deployed by `deploy-stock-analyser.yml`. Source in `infrastructure/lib/stock-analyser/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-StockAnalyserTables` | `StockAnalyserTablesStack` | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}`, `stock-analyser.analysis-cache-{stage}` |
| `Transformotion{Stage}-StockAnalyserApi` | `StockAnalyserApiStack` | Stock Analyser Lambda functions + routes on the shared platform API Gateway |

### Budget Tracker stacks

Deployed by `deploy-budget-tracker.yml`. Source in `infrastructure/lib/budget-tracker/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-BudgetTrackerTables` | `BudgetTrackerTablesStack` | `budget-tracker.accounts`, `budget-tracker.transactions`, `budget-tracker.rules`, `budget-tracker.settings` |
| `Transformotion{Stage}-BudgetTrackerApi` | `BudgetTrackerApiStack` | Budget Tracker Lambda functions + its own API Gateway (`budget-tracker-api-{stage}`) |

> **Note:** Budget Tracker has its own API Gateway rather than sharing the platform gateway. This is an architectural divergence from the intended model. It is functional and not blocking; consolidation to the platform gateway is tracked as sub-phase 7f (optional).

---

## Lambda functions

### Platform API Lambda functions (`Transformotion{Stage}-Api`)

| Function name | Handler | Routes |
|---|---|---|
| `transformotion-account-provisioning-{stage}` | `functions/auth/account-provisioning` | `POST /auth/setup`, `POST /auth/switch` |
| `transformotion-user-{stage}` | `functions/user` | `GET /api/user/profile`, `PUT /api/user/preferences` |
| `transformotion-claude-proxy-{stage}` | `functions/claude-proxy` | `POST /api/claude` |
| `transformotion-accounts-{stage}` | `functions/accounts` | `POST /accounts`, `GET/PUT/DELETE /accounts/{id}`, `GET /accounts/{id}/members`, `DELETE /accounts/{id}/members/{userId}` |
| `transformotion-invitations-{stage}` | `functions/auth/invitations` | `POST /accounts/{id}/invitations` |

### Auth API Lambda functions (`Transformotion{Stage}-AuthApi`)

| Function name | Handler | Routes |
|---|---|---|
| `transformotion-forgot-provider-{stage}` | `functions/auth/forgot-provider` | `POST /auth/lookup-provider` (public) |

### Pre-token generation Lambda (`Transformotion{Stage}-Auth`)

| Function name | Handler | Trigger |
|---|---|---|
| `transformotion-pre-token-generation-{stage}` | `functions/auth/pre-token-generation` | Cognito pre-token-generation trigger |

### Stock Analyser Lambda functions (`Transformotion{Stage}-StockAnalyserApi`)

| Function name | Handler | Routes |
|---|---|---|
| `transformotion-portfolio-{stage}` | `apps/stock-analyser/functions/portfolio` | `GET/POST/PATCH/DELETE /api/portfolio` |
| `transformotion-watchlist-{stage}` | `apps/stock-analyser/functions/watchlist` | `GET/POST/PATCH/DELETE /api/watchlist` |
| `transformotion-analysis-cache-{stage}` | `apps/stock-analyser/functions/analysis-cache` | `GET /api/analysis-cache/*` |
| `transformotion-cycle-check-{stage}` | `apps/stock-analyser/functions/cycle-check` | EventBridge scheduled (no API Gateway route) |

### Budget Tracker Lambda functions (`Transformotion{Stage}-BudgetTrackerApi`)

| Function name | Handler | Routes |
|---|---|---|
| `budget-transactions-handler-{stage}` | Budget Tracker transactions Lambda | `GET/POST/PATCH/DELETE /api/budget/v1/transactions` |
| `budget-rules-handler-{stage}` | Budget Tracker rules Lambda | `GET/POST/PATCH/DELETE /api/budget/v1/rules` |
| `budget-settings-handler-{stage}` | Budget Tracker settings Lambda | `GET/PATCH /api/budget/v1/settings` |
| `budget-ai-categorise-handler-{stage}` | Budget Tracker AI Lambda | `POST /api/budget/v1/ai/categorise` |
| `budget-ai-review-handler-{stage}` | Budget Tracker AI Lambda | `POST /api/budget/v1/ai/review` |
| `budget-ai-csv-analysis-handler-{stage}` | Budget Tracker AI Lambda | `POST /api/budget/v1/ai/csv-analysis` |
| `budget-export-handler-{stage}` | Budget Tracker export Lambda | `GET /api/budget/v1/business-export` |
| `budget-migrate-handler-{stage}` | Budget Tracker migrate Lambda | `POST /api/budget/v1/migrate-from-localstorage` |

---

## Cross-stack dependencies

Stacks receive constructs via `props` in `bin/app.ts`. Cross-stack references generate `Fn::ImportValue` in CloudFormation templates.

| Consumer stack | Receives from | Props |
|---|---|---|
| `AuthApiStack` | `AuthStack` | `userPoolId` (string — avoids construct reference) |
| `PlatformApiStack` | `AuthStack` | `userPool` (construct) |
| `PlatformApiStack` | `StockAnalyserTablesStack` | `analysisCacheTable` (construct) |
| `StockAnalyserApiStack` | `PlatformApiStack` | `api` and `authoriser` (constructs) |
| `BudgetTrackerApiStack` | `AuthStack` | `userPool` (construct — for its own authoriser) |

---

## Deploy ordering

`deploy-platform.yml` sequences its CDK steps explicitly to avoid CloudFormation dependency conflicts:

1. **Step 1 — BudgetTrackerTables first** — deploys `TransformotionDev-BudgetTrackerTables` in isolation. This must complete before Auth deploys, because BudgetTrackerTables previously imported an Auth export that needed to be released first.
2. **Step 2 — Main platform stacks** — deploys `Storage`, `Network`, `Auth`, `AuthApi`, `Api` together. CDK runs independent stacks in parallel within this step.
3. **Step 3 — PlatformTables** — deploys `PlatformTables` alone, after `Api` has updated its template. This ordering ensures `Api` releases any `Fn::ImportValue` exports before `PlatformTables` attempts to drop them.

The StockAnalyserTables deploy is triggered by `deploy-stock-analyser.yml`, not `deploy-platform.yml`. When a cross-stack prop flows from `StockAnalyserTables` → `PlatformApi`, that workflow must run first (or `PlatformApi` must use `fromTableName` as a temporary workaround — see data.md CDK constraints).

---

## Stack naming convention

All stacks follow the pattern `Transformotion{Stage}-{Name}` where `Stage` is `Dev` or `Prod` (capitalised).

CDK logical IDs within stacks use PascalCase resource names. Renaming a logical ID forces CloudFormation to replace the resource — avoid unless intentional.

---

## Environment variables injected into Lambda functions

Common environment variables available to all Lambda functions:

| Variable | Value |
|---|---|
| `REGION` | `ap-southeast-2` (via CDK `this.region`) |
| `AWS_REGION` | Set automatically by Lambda runtime |

Platform Lambda environment variables:

| Variable | Lambda | Value |
|---|---|---|
| `ACCOUNTS_TABLE` | account-provisioning, accounts, invitations | `platform.accounts-{stage}` |
| `ACCOUNT_MEMBERS_TABLE` | account-provisioning, accounts, pre-token-generation | `platform.account-members-{stage}` |
| `INVITATIONS_TABLE` | invitations | `platform.invitations-{stage}` |
| `USERS_TABLE` | user | `platform.users-{stage}` |
| `CACHE_TABLE` | claude-proxy | `stock-analyser.analysis-cache-{stage}` |
| `ANTHROPIC_SECRET_NAME` | claude-proxy | `{stage}/anthropic/api-key` (Secrets Manager) |
| `USER_POOL_ID` | account-provisioning, pre-token-generation | Cognito user pool ID |
| `ACCOUNTS_TABLE` | pre-token-generation | `platform.accounts-{stage}` (read for appSlug resolution) |

---

## Removal policies

| Stage | Tables / User Pool | Other resources |
|---|---|---|
| `dev` | `DESTROY` (data not permanent) | `DESTROY` with `autoDeleteObjects` on S3 |
| `prod` | `RETAIN` (data is permanent) | `RETAIN` on user pool, Secrets Manager entries |

Secrets Manager entries for social IDP credentials are always `RETAIN` in both environments (credentials should not be destroyed if the stack is torn down).

---

## CI checks

### Lambda categories

There are three categories of Lambda in this repo. Category determines authorization pattern and CI check applicability.

**App handlers** — Lambdas serving authenticated user requests for a specific app. Located in `apps/*/functions/` (per-app) or `functions/claude-proxy/` (cross-app). Subject to the documented authorization pattern: `requireAppAccess` (or `requireAnyAppAccess`) at the top, then `requireAccountAccess` before account-scoped data operations. CI enforces this pattern.

**Auth infrastructure** — Lambdas that produce, verify, or recover identity-related state. Located in `functions/auth/`. Examples: `pre-token-generation`, `forgot-provider`, `account-provisioning`, `invitations` (forthcoming). Each has a bespoke authorization pattern (some unauthenticated, some `withAuthOnly`, some `requireAccountOwner`, etc.). Not subject to the CI handler-authz check.

**Platform infrastructure** — Lambdas managing platform-level data. Currently: `functions/accounts/`. Uses inline membership checks against the data it manages rather than consuming JWT claims. Not subject to the CI handler-authz check.

---

Two grep-based checks run in the `Typecheck & Lint` CI job on every PR. They enforce the handler authorization patterns described in [auth.md](./auth.md).

### `check-no-new-require-group.sh`

Fails if any handler file calls `requireGroup`. `requireGroup` is deprecated — all handlers were migrated to `requireAppAccess` / `requireAccountAccess` in sub-phase 7e. Zero usages is the expected baseline.

Removal: delete this script when 7e-cleanup removes `requireGroup` from the middleware package entirely.

### `check-handler-authz-pattern.sh`

Fails if any handler file performs a DynamoDB operation (`PutItemCommand`, `GetItemCommand`, `QueryCommand`, `ScanCommand`, `UpdateItemCommand`, `DeleteItemCommand`, `TransactWriteCommand`, `BatchGetCommand`, `BatchWriteCommand`) without also calling at least one of `requireAppAccess`, `requireAnyAppAccess`, `requireAccountAccess`, `requireAccountOwner`, or `requireSiteAdmin`.

This is a coarse file-level check — it confirms authorization helpers are present; it does not verify call ordering.

### Checked paths

Both checks cover the same scope:

- `apps/*/functions/` — app-specific handlers (Budget Tracker, Stock Analyser)
- `functions/claude-proxy/` — platform multi-app handler

### Exempt paths

| Path | Category | Reason |
|---|---|---|
| `functions/auth/pre-token-generation/` | auth-infrastructure | Cognito trigger (`PreTokenGenerationTriggerEvent`), not API Gateway — reads DynamoDB to build JWT claims, cannot consume them |
| `functions/auth/forgot-provider/` | auth-infrastructure | Public endpoint (`withPublic`); DynamoDB used for rate-limiting only, no JWT context |
| `functions/auth/account-provisioning/` | auth-infrastructure | First-login route (`withAuthOnly`); user is authenticated but has no app claims yet — `requireAppAccess` is inapplicable by design |
| `functions/accounts/` | platform-infrastructure | Platform accounts API — manages the accounts table that the pre-token Lambda reads; does inline DynamoDB membership checks rather than consuming JWT claims (it IS the accounts system) |

---

## Adding a new app's CDK stacks

When a new app is added to the platform:

1. Create `infrastructure/lib/{app-name}/{app-name}-tables-stack.ts` — DynamoDB tables
2. Create `infrastructure/lib/{app-name}/{app-name}-api-stack.ts` — Lambda functions, routes added to the shared platform API Gateway (`api` and `authoriser` props from `PlatformApiStack`)
3. Register both stacks in `infrastructure/bin/app.ts` for both `dev` and `prod`
4. Update `deploy-platform.yml` if tables need to deploy before other stacks
5. Add a Cognito app client for the new app in `auth-stack.ts`
6. Update `docs/architecture/cdk.md` (this file) with the new stacks
