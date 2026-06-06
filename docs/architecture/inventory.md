# Current-State Inventory

This document records the current deployed architecture for Transformotion Apps.
It is factual inventory, not a target-state plan.

## Ownership Summary

| Owner | Current responsibility |
|---|---|
| Platform | Neutral substrate: GitHub Actions deploy roles, S3/CloudFront hosting substrate, DNS/ACM integration, backup storage |
| Launchpad | Cognito auth domain, Hosted UI, app clients, groups, social IdP configuration, auth-domain tables, pre-token trigger, auth/control-plane APIs, Launchpad frontend |
| Stock Analyser | REST API, WSS API, AI runtime, Stock Analyser data tables, frontend |
| Budget Tracker | REST API, WSS API, AI runtime, Budget Tracker data tables, frontend |
| Migration Utilities | Migration utility API and migration-specific infrastructure |

Platform does not own live auth resources, app APIs, app WSS APIs, or shared AI
runtime.

## CDK Entrypoints

| Entrypoint | Owner | Current stacks |
|---|---|---|
| `infrastructure/bin/platform.ts` | Platform | `Transformotion-GithubActionsRole`, `Transformotion{Stage}-Storage`, `Transformotion{Stage}-Network`, empty legacy decommission placeholders |
| `infrastructure/bin/launchpad.ts` | Launchpad | `Transformotion{Stage}-LaunchpadAuth`, `Transformotion{Stage}-LaunchpadControlPlane` |
| `infrastructure/bin/stock-analyser.ts` | Stock Analyser | `Transformotion{Stage}-StockAnalyserTables`, `Transformotion{Stage}-StockAnalyserWs`, `Transformotion{Stage}-StockAnalyserApi` |
| `infrastructure/bin/budget-tracker.ts` | Budget Tracker | `Transformotion{Stage}-BudgetTrackerTables`, `Transformotion{Stage}-BudgetTrackerWs`, `Transformotion{Stage}-BudgetTrackerApi` |
| `infrastructure/bin/migration-utilities.ts` | Migration Utilities | `Transformotion{Stage}-MigrationsApi` |

During the Platform auth decommission PR, the Platform entrypoint also
synthesizes empty templates for legacy stack names:

- `Transformotion{Stage}-Auth`
- `Transformotion{Stage}-AuthApi`
- `Transformotion{Stage}-PlatformTables`
- `Transformotion{Stage}-Api`
- `Transformotion{Stage}-PlatformWs`

Deploying those empty templates deletes the resources that previously lived in
those stacks. They are not live ownership surfaces.

## Launchpad Auth Domain

`Transformotion{Stage}-LaunchpadAuth` owns:

- Cognito User Pool: `launchpad-auth-{stage}`
- Hosted UI domain
- Launchpad, Stock Analyser, and Budget Tracker app clients
- Cognito groups: `site-admin`, `stock-app-access`, `budget-app-access`
- Social IdP configuration and secret placeholders
- Hosted UI customization
- Pre-token trigger: `launchpad-pre-token-generation-{stage}`
- Tables:
  - `launchpad-users-{stage}`
  - `launchpad-accounts-{stage}`
  - `launchpad-account-members-{stage}`
  - `launchpad-invitations-{stage}`
  - `launchpad-rate-limits-{stage}`

The pre-token trigger emits the `apps`, `accounts`, and `site_admin` claims
consumed by Launchpad, Stock Analyser, Budget Tracker, and migration utilities.

## Launchpad Control Plane

`Transformotion{Stage}-LaunchpadControlPlane` owns the live control-plane REST
API and Lambdas:

| Route | Lambda |
|---|---|
| `POST /auth/lookup-provider` | `launchpad-forgot-provider-{stage}` |
| `POST /auth/setup` | `launchpad-account-provisioning-{stage}` |
| `GET /api/user/profile` | `launchpad-user-{stage}` |
| `PUT /api/user/preferences` | `launchpad-user-{stage}` |
| `POST /accounts` | `launchpad-accounts-{stage}` |
| `GET /accounts/{accountId}` | `launchpad-accounts-{stage}` |
| `PUT /accounts/{accountId}` | `launchpad-accounts-{stage}` |
| `DELETE /accounts/{accountId}` | `launchpad-accounts-{stage}` |
| `GET /accounts/{accountId}/members` | `launchpad-accounts-{stage}` |
| `DELETE /accounts/{accountId}/members/{userId}` | `launchpad-accounts-{stage}` |
| `POST /accounts/{accountId}/invitations` | `launchpad-invitations-{stage}` |

## Stock Analyser

Stock Analyser owns:

- `Transformotion{Stage}-StockAnalyserTables`
- `Transformotion{Stage}-StockAnalyserWs`
- `Transformotion{Stage}-StockAnalyserApi`
- WSS connection table: `stock-analyser.ws-connections-{stage}`
- AI job results table: `stock-analyser.job-results-{stage}`
- AI runtime Lambda: `stock-analyser-ai-proxy-{stage}`

The runtime flow is:

```text
Browser
  -> StockAnalyserApi
  -> stock-analyser-ai-proxy
  -> stock-analyser.job-results
  -> StockAnalyserWs
  -> Browser
```

## Budget Tracker

Budget Tracker owns:

- `Transformotion{Stage}-BudgetTrackerTables`
- `Transformotion{Stage}-BudgetTrackerWs`
- `Transformotion{Stage}-BudgetTrackerApi`
- WSS connection table: `budget-tracker.ws-connections-{stage}`
- AI jobs table: `budget-tracker.ai-jobs-{stage}`
- AI runtime Lambda: `budget-tracker-ai-proxy-{stage}`

The runtime flow is:

```text
Browser
  -> BudgetTrackerApi
  -> budget-ai-handler
  -> budget-tracker-ai-proxy
  -> BudgetTrackerWs
  -> Browser
```

## Migration Utilities

`Transformotion{Stage}-MigrationsApi` owns the migration utility REST API. It
uses LaunchpadAuth for JWT authorization and does not import Platform API/Auth
exports.

## Deploy Workflows

| Workflow | Owner | Trigger paths |
|---|---|---|
| `deploy-platform.yml` | Platform | `platform/infrastructure/**`, `infrastructure/bin/platform.ts` |
| `deploy-launchpad.yml` | Launchpad | `apps/launchpad/**` except documentation-only app files, `infrastructure/bin/launchpad.ts`, Launchpad dependency paths |
| `deploy-stock-analyser.yml` | Stock Analyser | `apps/stock-analyser/**` except documentation-only app files, `infrastructure/bin/stock-analyser.ts`, Stock Analyser dependency paths |
| `deploy-budget-tracker.yml` | Budget Tracker | `apps/budget-tracker/**` except documentation-only app files, `infrastructure/bin/budget-tracker.ts`, Budget Tracker dependency paths |
| `deploy-migration-utilities.yml` | Migration Utilities | `migration-utilities/**` except documentation-only utility files, `infrastructure/bin/migration-utilities.ts` |

The manual `cd.yml` workflow remains the explicit full redeploy path.

## Decommission Matrix

| Legacy resource | Former stack | Remaining consumers | Delete risk | Action |
|---|---|---|---|---|
| Platform Cognito User Pool, domain, app clients, groups, social IdPs | `Transformotion{Stage}-Auth` | None after LaunchpadAuth cutover | Medium: destructive but no live consumer | Replace stack with empty template |
| Platform pre-token trigger | `Transformotion{Stage}-Auth` | None | Low | Replace stack with empty template |
| Platform auth/account tables | `Transformotion{Stage}-PlatformTables` | None after LaunchpadAuth cutover and migration utility detachment | Medium: deletes legacy data | Replace stack with empty template |
| Platform AuthApi routes | `Transformotion{Stage}-AuthApi` | None | Low | Replace stack with empty template |
| Platform REST API/control-plane rollback routes | `Transformotion{Stage}-Api` | None after SA/BT/migration utility ownership cutovers | Medium: removes legacy API endpoint | Replace stack with empty template |
| Platform WSS API and connection table | `Transformotion{Stage}-PlatformWs` | None after SA/BT WSS ownership cutovers | Low | Replace stack with empty template |
| Platform Lambda function source | `platform/functions/**` | None | None | Remove from repo/workspace |

## Validation Expectations

After Platform auth decommission deploy:

- Launchpad sign-in/sign-out works through LaunchpadAuth.
- Launchpad control-plane authenticated routes authorize LaunchpadAuth tokens.
- Stock Analyser REST and WSS authorize LaunchpadAuth tokens.
- Budget Tracker REST and WSS authorize LaunchpadAuth tokens.
- Migration Utilities authorize LaunchpadAuth tokens.
- Platform deploy manages substrate only plus the one-time empty legacy stack
  templates needed to delete former resources.
