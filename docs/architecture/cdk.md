# CDK stack topology

## Overview

AWS CDK in TypeScript at `infrastructure/`. Each group of stacks has its own CDK app entrypoint in `infrastructure/bin/`; stacks are never shared across environments.

Account ID: `959516291617`  
Region: `ap-southeast-2`

| Entrypoint | Stacks synthesised | Deploy workflow |
|---|---|---|
| `infrastructure/bin/platform.ts` | All platform stacks (Network, Auth, AuthApi, PlatformTables, Api, PlatformWs, Storage, GithubActionsRole) | `deploy-platform.yml` |
| `infrastructure/bin/stock-analyser.ts` | `StockAnalyserTables`, `StockAnalyserApi` | `deploy-stock-analyser.yml` |
| `infrastructure/bin/budget-tracker.ts` | `BudgetTrackerTables`, `BudgetTrackerApi` | `deploy-budget-tracker.yml` |
| `infrastructure/bin/migration-utilities.ts` | `MigrationsApi` | `deploy-migration-utilities.yml` |
| `infrastructure/bin/launchpad.ts` | Launchpad stacks | `deploy-launchpad.yml` |

Each entrypoint synthesises *only* the stacks it owns. App stacks (SA, BT, MU) resolve shared platform resources (REST API, authoriser, WebSocket API) via CloudFormation imports at deploy time — not via construct references passed through props. This enables independent deployment: changing SA code deploys only SA stacks; the platform stacks are untouched.

Stacks are deployed by GitHub Actions workflows — see [urls-and-deploy.md](./urls-and-deploy.md) for workflow triggers.

---

## Stack inventory

### Storage stack

`TransformotionDev-Storage` / `TransformotionProd-Storage`.

Contains the platform-level S3 buckets that are not tied to a specific app. Currently holds:

- `transformotion-backups-{account}` — dedicated bucket for one-shot backups (e.g., pre-migration data exports, configuration snapshots). Versioned, encrypted, with lifecycle rules on the `migration-backups/` prefix transitioning to Infrequent Access after 30 days and expiring after 365 days.

The Storage stack is independent of other stacks (no cross-stack exports or imports).

### Platform stacks

Deployed by `deploy-platform.yml`. Source in `platform/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-Storage` | `StorageStack` | S3 backups bucket `transformotion-backups-{account}` for platform migrations and one-shot backups |
| `Transformotion{Stage}-Network` | `NetworkStack` | S3 bucket `transformotion-web-{stage}-959516291617`, CloudFront distribution, ACM cert wiring |
| `Transformotion{Stage}-Auth` | `AuthStack` | Cognito user pool, three app clients, Cognito groups, Secrets Manager entries for social IDP credentials, Hosted UI domain |
| `Transformotion{Stage}-AuthApi` | `AuthApiStack` | `transformotion-forgot-provider-{stage}` Lambda + its own API Gateway (public — no JWT required on `/auth/lookup-provider`) |
| `Transformotion{Stage}-PlatformTables` | `PlatformTablesStack` | `platform.users`, `platform.accounts`, `platform.account-members`, `platform.invitations` DynamoDB tables |
| `Transformotion{Stage}-Api` | `PlatformApiStack` | Shared REST API Gateway (`transformotion-api-{stage}`), Cognito JWT authoriser, platform Lambda functions (see below) |
| `Transformotion{Stage}-PlatformWs` | `PlatformWsStack` | WebSocket API Gateway `platform-ws-{stage}`, 4 WS Lambdas, `platform.ws-connections-{stage}` table; shared by all apps for async AI notifications |

### Stock Analyser stacks

Deployed by `deploy-stock-analyser.yml`. Source in `apps/stock-analyser/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-StockAnalyserTables` | `StockAnalyserTablesStack` | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}`, `stock-analyser.analysis-cache-{stage}` |
| `Transformotion{Stage}-StockAnalyserApi` | `StockAnalyserApiStack` | Stock Analyser Lambda functions + routes on the shared platform API Gateway |

### Budget Tracker stacks

Deployed by `deploy-budget-tracker.yml`. Source in `apps/budget-tracker/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-BudgetTrackerTables` | `BudgetTrackerTablesStack` | `budget-tracker.accounts`, `budget-tracker.transactions`, `budget-tracker.rules`, `budget-tracker.settings` |
| `Transformotion{Stage}-BudgetTrackerApi` | `BudgetTrackerApiStack` | Budget Tracker Lambda functions + routes on the shared platform API Gateway |

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
| `transformotion-cycle-data-{stage}` | `apps/stock-analyser/functions/cycle-data` | `GET /cycle/ohlcv?ticker=` |
| `transformotion-market-data-{stage}` | `apps/stock-analyser/functions/market-data` | `GET /price/ohlcv?ticker=&range=&interval=` |

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

### Platform WS Lambda functions (`Transformotion{Stage}-PlatformWs`)

API Gateway v2 WebSocket — does not use `CognitoUserPoolsAuthorizer`; uses a custom Lambda authoriser instead. Shared by all apps.

| Function name | Handler | Route / trigger |
|---|---|---|
| `platform-ws-authorizer-{stage}` | `platform/functions/ws-authorizer` | Custom Lambda authoriser for `$connect`; validates Cognito ID token from `?token=` query string; checks `accounts[appName]` membership; `?app=` selects app scope |
| `platform-ws-connect-{stage}` | `platform/functions/ws-connect` | `$connect` route — writes `{ connectionId, userId, accountId, app, expiresAt }` to `platform.ws-connections-{stage}` |
| `platform-ws-disconnect-{stage}` | `platform/functions/ws-disconnect` | `$disconnect` route — deletes connection record |
| `platform-ws-default-{stage}` | `platform/functions/ws-default` | `$default` route — handles `{ action: 'init' }` handshake, responds with `{ type: 'connected', connectionId }`; has `execute-api:ManageConnections` IAM grant |

---

## Cross-stack dependencies

### Platform-internal construct passing (within `bin/platform.ts`)

Stacks in the same entrypoint share constructs via props as usual. CDK resolves these as `Fn::ImportValue` in the CloudFormation template.

| Consumer stack | Receives from | Props |
|---|---|---|
| `AuthApiStack` | `AuthStack` | `userPoolId` (string — avoids construct reference) |
| `PlatformApiStack` | `AuthStack` | `userPool` (construct) |
| `PlatformApiStack` | `PlatformWsStack` | `wsApiEndpoint`, `wsApiId` (strings — for claude-proxy WSS push permission) |
| `PlatformWsStack` | `AuthStack` | `userPool` (construct — for custom authoriser JWKS validation) |

### CF export pattern — app stacks to platform stacks (cross-entrypoint)

App stacks (`StockAnalyserApiStack`, `BudgetTrackerApiStack`, `MigrationsApiStack`) resolve shared platform resources via CloudFormation exports at deploy time. No construct references cross entrypoint boundaries.

`PlatformApiStack` and `PlatformWsStack` emit these exports:

| Export name | Produced by | Consumed by |
|---|---|---|
| `Transformotion-{stage}-RestApiId` | `PlatformApiStack` | SA, BT, MU — `RestApi.fromRestApiAttributes` |
| `Transformotion-{stage}-RestApiRootResourceId` | `PlatformApiStack` | SA, BT, MU — `RestApi.fromRestApiAttributes` |
| `Transformotion-{stage}-AuthorizerId` | `PlatformApiStack` | SA, BT, MU — JWT authoriser on each route |
| `Transformotion-{stage}-ApiResourceId` | `PlatformApiStack` | BT, MU — `Resource.fromResourceAttributes` to mount under `/api/` |
| `PlatformWs-{stage}-WsApiId` | `PlatformWsStack` | BT — WebSocket API ID for Lambda env var |

The rule: cross-entrypoint references always go through CF exports (`Fn.importValue`), never through L2 construct passing. This allows each entrypoint to synthesise independently — no platform stacks are instantiated in app entrypoints.

---

## Deploy ordering

`deploy-platform.yml` sequences its CDK steps explicitly to avoid CloudFormation dependency conflicts:

1. **Step 1 — GithubActionsRole** — account-level stack; deployed first as a one-off.
2. **Step 2 — PlatformTables** — deployed in isolation before Auth, to release any stale export dependencies.
3. **Step 3 — Main platform stacks** — deploys `Storage`, `Network`, `Auth`, `AuthApi`, `Api` together. CDK runs independent stacks in parallel within this step. `PlatformApiStack` emits the CF exports that SA/BT/MU consume.
4. **Step 4 — PlatformWs** — deployed after `Api` so its `PlatformWs-{stage}-WsApiId` export is available to BT on next app deploy.

App stacks (`deploy-stock-analyser.yml`, `deploy-budget-tracker.yml`, `deploy-migration-utilities.yml`) consume the CF exports produced in Step 3/4 above. On first-ever deploy, the platform stacks must be deployed before the app stacks. On subsequent deploys, each workflow is independently triggered and independently deploys only its own stacks.

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
| `WS_API_ENDPOINT` | claude-proxy | `https://{wsApiId}.execute-api.{region}.amazonaws.com/{stage}` — management endpoint for WSS push |
| `USER_POOL_ID` | account-provisioning, pre-token-generation | Cognito user pool ID |
| `ACCOUNTS_TABLE` | pre-token-generation | `platform.accounts-{stage}` (read for appSlug resolution) |

Platform WS Lambda environment variables:

| Variable | Lambda | Value |
|---|---|---|
| `COGNITO_USER_POOL_ID` | `platform-ws-authorizer-{stage}` | Cognito user pool ID (for JWKS verification) |
| `PERMITTED_APPS` | `platform-ws-authorizer-{stage}` | `budget-tracker,stock-analyser` (comma-separated allowlist) |
| `APP_NAME` | `platform-ws-authorizer-{stage}` | Default app slug when `?app=` is absent (currently `budget-tracker`) |
| `CONNECTIONS_TABLE` | `platform-ws-connect-{stage}`, `platform-ws-disconnect-{stage}` | `platform.ws-connections-{stage}` |

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

1. Create `apps/{app-name}/infrastructure/{app-name}-tables-stack.ts` — DynamoDB tables
2. Create `apps/{app-name}/infrastructure/{app-name}-api-stack.ts` — Lambda functions + routes on the shared platform API Gateway. Import the API and authoriser via `Fn.importValue` using the CF export names above — do not accept `api`/`authoriser` as props.
3. Create `infrastructure/bin/{app-name}.ts` containing only the new app's stacks. Use `cdk.Fn.importValue` to resolve the CF exports from PlatformApiStack and PlatformWsStack.
4. Create `.github/workflows/deploy-{app-name}.yml` with `--app 'bin/{app-name}.ts'` on all CDK deploy steps.
5. Add a Cognito app client for the new app in `auth-stack.ts`.
6. Update `docs/architecture/cdk.md` (this file), `docs/architecture/urls-and-deploy.md`, and `CONTRIBUTING.md §3.4` with the new stacks.
