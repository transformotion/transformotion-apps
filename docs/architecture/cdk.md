# CDK stack topology

## Overview

AWS CDK is implemented in TypeScript under `infrastructure/`. Each deployable
owner has its own CDK app entrypoint in `infrastructure/bin/`; stacks are never
shared across environments and deploy workflows target only the stacks they own.

Account ID: `959516291617`
Region: `ap-southeast-2`

| Entrypoint | Stacks synthesised | Deploy workflow |
|---|---|---|
| `infrastructure/bin/platform.ts` | `GithubActionsRole`, `Storage`, `Network`, empty legacy decommission placeholders | `deploy-platform.yml` |
| `infrastructure/bin/launchpad.ts` | `LaunchpadAuth`, `LaunchpadControlPlane` | `deploy-launchpad.yml` |
| `infrastructure/bin/stock-analyser.ts` | `StockAnalyserTables`, `StockAnalyserWs`, `StockAnalyserApi` | `deploy-stock-analyser.yml` |
| `infrastructure/bin/budget-tracker.ts` | `BudgetTrackerTables`, `BudgetTrackerWs`, `BudgetTrackerApi` | `deploy-budget-tracker.yml` |
| `infrastructure/bin/migration-utilities.ts` | `MigrationsApi` | `deploy-migration-utilities.yml` |

Platform is neutral substrate only. Launchpad owns the auth domain and
control-plane. Stock Analyser and Budget Tracker own their app runtimes.

## Platform stacks

Deployed by `deploy-platform.yml`. Source: `platform/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion-GithubActionsRole` | `GithubActionsRoleStack` | GitHub Actions OIDC deploy roles |
| `Transformotion{Stage}-Storage` | `StorageStack` | S3 backups bucket `transformotion-backups-{account}` |
| `Transformotion{Stage}-Network` | `NetworkStack` | Web S3 bucket, CloudFront distribution, ACM certificate wiring |

Platform no longer owns Cognito, auth/control-plane APIs, auth-domain tables,
shared app REST APIs, shared app WSS, or shared AI runtime.

During the Platform auth decommission, `infrastructure/bin/platform.ts`
synthesizes empty templates for legacy stack names (`Auth`, `AuthApi`,
`PlatformTables`, `Api`, `PlatformWs`). Deploying those empty templates deletes
the old resources from CloudFormation. They are not live ownership surfaces.

## Launchpad stacks

Deployed by `deploy-launchpad.yml`. Source: `apps/launchpad/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-LaunchpadAuth` | `LaunchpadAuthStack` | Cognito User Pool, Hosted UI domain, app clients, groups, Hosted UI customisation, social credential secret placeholders, Launchpad-owned auth-domain tables, and `launchpad-pre-token-generation-{stage}` |
| `Transformotion{Stage}-LaunchpadControlPlane` | `LaunchpadControlPlaneStack` | Launchpad-owned REST API, Cognito authoriser, AI runtime config table, and control-plane Lambdas |

Launchpad owns authentication, token claims, account onboarding, user
profile/preferences, account administration, member administration, and
invitations. Launchpad also owns AI provider/model configuration as
control-plane state; app-owned AI proxy Lambdas read that configuration
read-only and keep provider execution in their app runtimes.

### Launchpad Lambdas

| Function name | Handler | Routes / trigger |
|---|---|---|
| `launchpad-forgot-provider-{stage}` | `apps/launchpad/functions/forgot-provider` | `POST /auth/lookup-provider` |
| `launchpad-account-provisioning-{stage}` | `apps/launchpad/functions/account-provisioning` | `POST /auth/setup` |
| `launchpad-user-{stage}` | `apps/launchpad/functions/user` | `GET /api/user/profile`, `PUT /api/user/preferences` |
| `launchpad-accounts-{stage}` | `apps/launchpad/functions/accounts` | `POST /accounts`, `GET/PUT/DELETE /accounts/{id}`, `GET /accounts/{id}/members`, `GET /accounts/{id}/members/detail` (incl. account-scoped pending invitations, #555), `DELETE /accounts/{id}/members/{userId}` |
| `launchpad-invitations-{stage}` | `apps/launchpad/functions/invitations` | `POST /accounts/{id}/invitations` |
| `launchpad-invitation-bundles-{stage}` | `apps/launchpad/functions/invitation-bundles` | `POST /api/invitations/bundles` (create), `GET …/bundles` (list), `GET …/bundles/{bundleId}` (resolve), `DELETE …/bundles/{bundleId}/grants/{grantId}` (cancel grant, #558) |
| `launchpad-invitation-redemption-{stage}` | `apps/launchpad/functions/invitation-redemption` | `POST /api/invitations/bundles/{bundleId}/redeem` + `…/redeem-as` (dev-only bypass, STAGE-guarded) |
| `launchpad-ai-runtime-config-{stage}` | `apps/launchpad/functions/ai-runtime-config` | `GET /api/admin/ai-runtime-config`, `PUT /api/admin/ai-runtime-config/platform-default`, `PUT/DELETE /api/admin/ai-runtime-config/apps/{appSlug}/override` |
| `launchpad-pre-token-generation-{stage}` | `apps/launchpad/functions/pre-token-generation` | Cognito pre-token generation trigger |

## Stock Analyser stacks

Deployed by `deploy-stock-analyser.yml`. Source:
`apps/stock-analyser/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-StockAnalyserTables` | `StockAnalyserTablesStack` | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}`, `stock-analyser.analysis-cache-{stage}`, `stock-analyser.job-results-{stage}`, `stock-analyser.settings-{stage}`, `stock-analyser.notification-state-{stage}` |
| `Transformotion{Stage}-StockAnalyserWs` | `StockAnalyserWsStack` | Stock Analyser-owned WebSocket API, WSS Lambdas, and `stock-analyser.ws-connections-{stage}` |
| `Transformotion{Stage}-StockAnalyserApi` | `StockAnalyserApiStack` | Stock Analyser-owned REST API Gateway, Lambda functions, Cognito authoriser, `stock-analyser-ai-proxy-{stage}`, and daily `stock-analyser-notification-engine-{stage}` EventBridge processing |

## Budget Tracker stacks

Deployed by `deploy-budget-tracker.yml`. Source:
`apps/budget-tracker/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-BudgetTrackerTables` | `BudgetTrackerTablesStack` | Budget Tracker app data tables |
| `Transformotion{Stage}-BudgetTrackerWs` | `BudgetTrackerWsStack` | Budget Tracker-owned WebSocket API, WSS Lambdas, and `budget-tracker.ws-connections-{stage}` |
| `Transformotion{Stage}-BudgetTrackerApi` | `BudgetTrackerApiStack` | Budget Tracker-owned REST API Gateway, Lambda functions, and `budget-tracker-ai-proxy-{stage}` |

## Migration Utilities

Deployed by `deploy-migration-utilities.yml`. Source:
`migration-utilities/infrastructure/`.

| Stack name | Class | Contents |
|---|---|---|
| `Transformotion{Stage}-MigrationsApi` | `MigrationsApiStack` | Migration-only API Gateway and Lambda routes |

Migration utilities use their own API Gateway and the LaunchpadAuth User Pool
authoriser. They do not import Platform API/Auth outputs.

## CloudFormation exports

Cross-entrypoint references use CloudFormation exports via `Fn.importValue`.
Constructs are not passed across entrypoint boundaries.

| Export name | Produced by | Consumed by |
|---|---|---|
| `Transformotion-{stage}-LaunchpadAuth-UserPoolId` | `LaunchpadAuthStack` | Launchpad, Stock Analyser, Budget Tracker, migration utilities |
| `Transformotion-{stage}-LaunchpadAuth-UserPoolArn` | `LaunchpadAuthStack` | Launchpad control-plane and app infrastructure |
| `Transformotion-{stage}-LaunchpadAuth-LaunchpadAppClientId` | `LaunchpadAuthStack` | Launchpad frontend env injection |
| `Transformotion-{stage}-LaunchpadAuth-StockAnalyserAppClientId` | `LaunchpadAuthStack` | Stock Analyser frontend env injection |
| `Transformotion-{stage}-LaunchpadAuth-BudgetTrackerAppClientId` | `LaunchpadAuthStack` | Budget Tracker frontend env injection |
| `Transformotion-{stage}-LaunchpadAuth-CognitoDomain` | `LaunchpadAuthStack` | Frontend Hosted UI env injection |
| `Transformotion-{stage}-LaunchpadAuth-UsersTableName` | `LaunchpadAuthStack` | Launchpad control-plane stack |
| `Transformotion-{stage}-LaunchpadAuth-AccountsTableName` | `LaunchpadAuthStack` | Launchpad control-plane stack |
| `Transformotion-{stage}-LaunchpadAuth-AccountMembersTableName` | `LaunchpadAuthStack` | Launchpad control-plane stack |
| `Transformotion-{stage}-LaunchpadAuth-InvitationsTableName` | `LaunchpadAuthStack` | Launchpad control-plane stack |
| `Transformotion-{stage}-LaunchpadAuth-RateLimitsTableName` | `LaunchpadAuthStack` | Launchpad control-plane stack |
| `Transformotion-{stage}-LaunchpadControlPlaneApiUrl` | `LaunchpadControlPlaneStack` | Launchpad frontend env injection |
| `Transformotion-{stage}-LaunchpadAiRuntimeConfigTableName` | `LaunchpadControlPlaneStack` | Operational reference for Launchpad-owned AI runtime config table |
| `StockAnalyserApi-{stage}-Url` | `StockAnalyserApiStack` | Stock Analyser frontend env injection |
| `StockAnalyserWs-{stage}-Url` | `StockAnalyserWsStack` | Stock Analyser frontend env injection |
| `BudgetTrackerApi-{stage}-Url` | `BudgetTrackerApiStack` | Budget Tracker frontend env injection |
| `BudgetTrackerWs-{stage}-Url` | `BudgetTrackerWsStack` | Budget Tracker frontend env injection |

## Deploy ordering

`deploy-platform.yml` deploys platform substrate and the empty legacy
decommission placeholders:

1. `Transformotion-GithubActionsRole`
2. `Transformotion{Stage}-Storage`
3. `Transformotion{Stage}-Network`
4. Empty templates for the old `Auth`, `AuthApi`, `PlatformTables`, `Api`, and
   `PlatformWs` stack names, to remove former resources

Launchpad, Stock Analyser, Budget Tracker, and migration utilities deploy
independently through their own workflows. Platform deploys must not orchestrate
application, auth-domain, control-plane, WSS, REST, or AI runtime resources.

## Environment variables injected into Lambda functions

Common environment variables available to all Lambda functions:

| Variable | Value |
|---|---|
| `REGION` | `ap-southeast-2` where explicitly set by CDK |
| `AWS_REGION` | Set automatically by Lambda runtime |

Launchpad control-plane and auth-domain variables:

| Variable | Lambda | Value |
|---|---|---|
| `USERS_TABLE` | `launchpad-user-{stage}`, `launchpad-account-provisioning-{stage}`, `launchpad-invitation-redemption-{stage}`, `launchpad-pre-token-generation-{stage}` (#501, read-only) | `launchpad-users-{stage}` |
| `ACCOUNTS_TABLE` | Launchpad account-provisioning, accounts, invitations, pre-token generation | `launchpad-accounts-{stage}` |
| `ACCOUNT_MEMBERS_TABLE` | Launchpad account-provisioning, accounts, pre-token generation, invitee-search, invitation-bundles (#558, read-only — cancel-grant owner/manager check) | `launchpad-account-members-{stage}` |
| `INVITATIONS_TABLE` | `launchpad-invitations-{stage}`, `launchpad-accounts-{stage}` (#555, read-only — surfaces an account's pending invitations on `GET …/members/detail`), `launchpad-access-summary-{stage}` (read-only — per-user pending-invitation list + count, M11) | `launchpad-invitations-{stage}` |
| `RATE_LIMIT_TABLE` | `launchpad-forgot-provider-{stage}` | `launchpad-rate-limits-{stage}` |
| `USER_POOL_ID` | Launchpad control-plane/auth Lambdas | LaunchpadAuth User Pool ID |
| `APP_CLIENT_STOCK_ANALYSER` / `APP_CLIENT_BUDGET_TRACKER` | `launchpad-account-provisioning-{stage}` | LaunchpadAuth app client IDs |
| `APP_REGISTRY` | `launchpad-pre-token-generation-{stage}` | App registry JSON from `platform/config/app-registry.json` |
| `AI_CONFIG_TABLE` | `launchpad-ai-runtime-config-{stage}` | `launchpad-ai-runtime-config-{stage}` |

App-owned REST/WSS/AI environment variables are documented in each app's
`AGENTS.md`/`CLAUDE.md` and stack source. SA/BT AI proxy Lambdas receive
`AI_CONFIG_TABLE`, `AI_FALLBACK_PROVIDER`, and `AI_FALLBACK_MODEL` for the
runtime provider/model resolver. They also receive app-owned
`ANTHROPIC_SECRET_NAME` and `OPENAI_SECRET_NAME`; Launchpad stores provider/model
selection only and never provider API keys.

## Removal policies

| Stage | Tables / User Pool | Other resources |
|---|---|---|
| `dev` | `DESTROY` for app/auth-domain data unless a stack states otherwise | `DESTROY` with `autoDeleteObjects` only where the resource is explicitly ephemeral |
| `prod` | `RETAIN` for durable user/data resources | `RETAIN` where deleting data would be unsafe |

Secrets Manager entries for social IdP credentials are retained.

## GitHub Actions deploy IAM

M9 deploy isolation uses scoped GitHub Actions deploy roles. Source:
`platform/infrastructure/github-actions-role-stack.ts`.

| Role | Workflow | Primary ownership scope |
|---|---|---|
| `TransformotionPlatformDeployRole` | `deploy-platform.yml` | Platform substrate stacks |
| `TransformotionLaunchpadDeployRole` | `deploy-launchpad.yml` | All `Transformotion{Stage}-Launchpad*` stacks and Launchpad frontend deploy |
| `TransformotionStockAnalyserDeployRole` | `deploy-stock-analyser.yml` | Stock Analyser stacks and `/stock-analyser` web assets |
| `TransformotionBudgetTrackerDeployRole` | `deploy-budget-tracker.yml` | Budget Tracker stacks and `/budget-tracker` web assets |
| `TransformotionMigrationUtilitiesDeployRole` | `deploy-migration-utilities.yml` | Migration utilities stacks |
| `GitHubActionsDeployRole` | `cd.yml`; platform role bootstrap step | Legacy broad deploy role retained for bootstrap/rollback |

## CI checks

The handler authorization CI checks scan app-owned Lambda handlers under
`apps/*/functions/`. Launchpad control-plane/auth-domain handlers have bespoke
authorization patterns and are explicitly exempted where the generic app-data
authorization check is not applicable.

The Stock Analyser notification engine is exempted only at
`apps/stock-analyser/functions/notification-engine/src/index.ts`. It is a
JWT-less EventBridge scheduled service-principal job, not a request handler.
Its authorization is the dedicated least-privilege IAM role plus the M19 #529
in-job fail-closed membership and consent re-check before every recipient
delivery. The exemption is backed by tests for SHARED-only cache writes,
cross-account isolation, and fail-closed delivery; the check is waived, not the
auth requirement.

## Adding a new app's CDK stacks

1. Create `apps/{app-name}/infrastructure/{app-name}-tables-stack.ts` for app-owned tables where needed.
2. Create `apps/{app-name}/infrastructure/{app-name}-api-stack.ts` for the app-owned API Gateway, routes, Lambdas, and authorizer.
3. Create WSS and AI runtime stacks/packages only if the app needs those capabilities.
4. Create `infrastructure/bin/{app-name}.ts` containing only the new app's stacks.
5. Create `.github/workflows/deploy-{app-name}.yml` with explicit `--app 'bin/{app-name}.ts'` CDK commands.
6. Add the new app to `platform/config/app-registry.json` if it participates in Launchpad app access claims.
7. Update architecture docs and `MONOREPO.md` in the same PR.
