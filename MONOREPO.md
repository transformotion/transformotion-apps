# Transformotion Apps — Monorepo Guide

This document describes the monorepo's **current** structure, import
boundaries, and deploy machinery. It reflects what exists in the
repository today, not target structures from `CONTRIBUTING.md`.

For ways of working (workflow rules, discipline rule, branch naming,
status-tag system), see [`CONTRIBUTING.md`](./CONTRIBUTING.md). For
the canonical target structure that some directories below are
migrating toward, see [`CONTRIBUTING.md`](./CONTRIBUTING.md) Section
3. For the trajectory of work that includes those migrations, see
[`PLAN.md`](./PLAN.md).

When milestones in `PLAN.md` change the structure described here
(particularly M3 and M7), this document is updated in the same PR
that lands the migration. The discipline rule
(`CONTRIBUTING.md` Section 2.1) applies.

## Current structure

```
transformotion-apps/
├── apps/                                  # User-facing applications
│   ├── budget-tracker/                    # Budget Tracker, basePath /budget-tracker
│   │   ├── functions/                     # App-specific Lambda source, including app-owned WS handlers
│   │   ├── infrastructure/                # Budget Tracker CDK stacks
│   │   │   ├── budget-tracker-api-stack.ts
│   │   │   ├── budget-tracker-tables-stack.ts
│   │   │   └── bt-ws-stack.ts
│   │   ├── AGENTS.md                     # Canonical Budget Tracker agent guide
│   │   ├── CLAUDE.md                     # Claude Code compatibility mirror
│   │   └── package.json                   # @transformotion/budget-tracker
│   ├── launchpad/                         # Platform shell and control-plane app
│   │   ├── functions/                     # Launchpad-owned control-plane Lambda source
│   │   │   ├── account-provisioning/
│   │   │   ├── accounts/
│   │   │   ├── forgot-provider/
│   │   │   ├── invitations/
│   │   │   ├── pre-token-generation/
│   │   │   └── user/
│   │   ├── infrastructure/                # Launchpad CDK stacks
│   │   │   ├── launchpad-auth-stack.ts
│   │   │   └── launchpad-control-plane-stack.ts
│   │   ├── AGENTS.md                     # Canonical Launchpad agent guide
│   │   ├── CLAUDE.md                     # Claude Code compatibility mirror
│   │   └── package.json                   # @transformotion/launchpad
│   ├── stock-analyser/                    # Stock Signal Analyser, basePath /stock-analyser
│   │   ├── app/                           # Next.js App Router pages
│   │   ├── components/                    # App-specific React components
│   │   ├── functions/                     # App-specific Lambda source
│   │   ├── infrastructure/                # Stock Analyser CDK stacks
│   │   │   ├── stock-analyser-api-stack.ts
│   │   │   └── stock-analyser-tables-stack.ts
│   │   ├── lib/                           # Domain logic, services, adaptors
│   │   ├── stores/                        # Zustand stores
│   │   ├── AGENTS.md                     # Canonical Stock Analyser agent guide
│   │   ├── CLAUDE.md                     # Claude Code compatibility mirror
│   │   └── package.json                   # @transformotion/stock-analyser
├── packages/                              # Shared code consumed by 2+ apps
│   ├── api-client/                        # Typed HTTP client (@transformotion/api-client)
│   ├── auth-client/                       # Cognito + mock auth service implementations (@transformotion/auth-client)
│   ├── budget-domain/                     # Budget Tracker domain types and helpers
│   ├── cache/                             # Shared cache interfaces + MemoryCacheService (@transformotion/cache)
│   ├── data-access/                       # Shared Repository<T,ID> interface + query types (@transformotion/data-access)
│   ├── fn-claude-proxy-core/              # Shared Claude proxy mechanics (@transformotion/fn-claude-proxy-core)
│   ├── logger/                            # Shared Logger interface + ConsoleLogger (@transformotion/logger)
│   ├── lambda-middleware/                 # Shared withAuth/withAuthOnly wrappers
│   ├── rate-limit-middleware/             # Shared DynamoDB-backed rate-limit helpers (@transformotion/rate-limit-middleware)
│   ├── runtime-config/                    # Runtime profile + provider resolution + shared config sub-types + createConfig factory (@transformotion/runtime-config)
│   └── ui/                                # Organisational directory (not itself a package; §3.4)
│       ├── error-boundaries/              # @transformotion/ui-error-boundaries
│       └── primitives/                    # @transformotion/ui-primitives (56 shadcn components + hooks)
│
├── infrastructure/                        # AWS CDK entrypoint only
│   └── bin/
│       └── app.ts                         # CDK app entry — instantiates all stacks
│
├── platform/                              # Platform-owned deployable artefacts
│   ├── infrastructure/                    # Platform CDK stacks
│   │   ├── auth-stack.ts                  # Legacy live Cognito user pool, app clients, groups (#386 migration debt)
│   │   ├── auth-api-stack.ts              # Auth-related API endpoints
│   │   ├── github-actions-role-stack.ts   # GitHub Actions deploy IAM roles
│   │   ├── network-stack.ts               # CloudFront, S3, certificates
│   │   ├── platform-api-stack.ts          # Shared API Gateway
│   │   ├── platform-tables-stack.ts       # Platform DynamoDB tables
│   │   ├── platform-ws-stack.ts           # Platform WebSocket (shared async AI notifications)
│   │   └── storage-stack.ts              # S3 backups bucket
│   ├── AGENTS.md                         # Canonical platform agent guide
│   ├── CLAUDE.md                         # Claude Code compatibility mirror
│   └── functions/                         # Platform Lambda source (shared across apps)
│       ├── auth/                          # Auth-related Lambdas (own pnpm workspace glob)
│       │   ├── account-provisioning/      # Legacy rollback first-sign-in account creation
│       │   ├── pre-token-generation/      # Cognito pre-token trigger (claims)
│       │   ├── invitations/               # Legacy rollback invitation flow
│       │   └── forgot-provider/           # Legacy rollback federated identity recovery
│       ├── accounts/                      # Legacy rollback account management routes
│       ├── claude-proxy/                  # Legacy platform Anthropic API proxy (rollback/decommission path)
│       ├── user/                          # Legacy rollback user profile/preferences routes
│       ├── ws-authorizer/                 # WS $connect custom authoriser (Cognito JWT + accounts claim)
│       ├── ws-connect/                    # WS $connect handler (writes connection record)
│       ├── ws-default/                    # WS $default handler (init handshake → connectionId)
│       └── ws-disconnect/                 # WS $disconnect handler (deletes connection record)
│
├── contracts/                             # Per-scope normative contracts
│   ├── budget-tracker/                    # 8 contract files (data-models.md, ui-patterns.md, etc.)
│   └── stock-analyser/                    # DATA_CONTRACTS.md
│
├── docs/
│   ├── architecture/                      # Architecture invariants
│   │   ├── README.md
│   │   ├── auth.md
│   │   ├── data.md
│   │   ├── urls-and-deploy.md
│   │   └── cdk.md
│   └── archive/                           # Superseded documents
│       ├── DEVELOPMENT_PLAN.md
│       └── STABILISATION_FREEZE.md
│
├── migration-artifacts/                   # Historical data fixtures for backfill
│   └── budget-tracker/                    # 726-transaction Budget Tracker export
│
├── migration-utilities/                   # Data migration utilities (CONTRIBUTING.md Section 6)
│   └── infrastructure/                    # CDK stacks for the /api/migrations/... namespace
│       ├── lib/
│       │   └── migrations-api-stack.ts    # MigrationsApiStack — skeleton, routes added by consumers
│       ├── package.json                   # @transformotion/migration-utilities-infrastructure
│       └── tsconfig.json
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                         # PR typecheck + lint + CDK synth
│   │   ├── cd.yml                         # Manual full-platform redeploy
│   │   ├── deploy-platform.yml            # Triggered by platform/infrastructure/** and platform/functions/** changes
│   │   ├── deploy-launchpad.yml           # Triggered by apps/launchpad/** changes
│   │   ├── deploy-stock-analyser.yml      # Triggered by apps/stock-analyser/** changes
│   │   ├── deploy-budget-tracker.yml      # Triggered by apps/budget-tracker/** changes
│   │   └── deploy-migration-utilities.yml # Triggered by migration-utilities/** changes
│   └── CODEOWNERS
│
├── AGENTS.md                              # Canonical AI-agent operating guide
├── CLAUDE.md                              # Claude Code compatibility mirror
├── CONTRIBUTING.md                        # Ways of working
├── MONOREPO.md                            # This document
├── PLAN.md                                # Trajectory of work
├── README.md                              # Repo overview
├── SECURITY.md                            # Security policy
└── pnpm-workspace.yaml
```

`contracts/platform/` will be created when platform contracts are formalised.

`migration-utilities/infrastructure/` is a permanent peer to
`platform/infrastructure/` — utility infrastructure is conceptually
distinct from platform infrastructure and stays separate (per
`CONTRIBUTING.md` Section 6.4).

After #363, Launchpad owns the live auth/control-plane APIs. #386 adds a
staged `Transformotion{Stage}-LaunchpadAuth` stack under
`apps/launchpad/infrastructure/` as the Launchpad-owned Cognito/auth foundation.
`LaunchpadAuth` includes staged auth-domain tables and a staged pre-token
trigger. Live auth still uses the Platform AuthStack until cutover, so Platform
physically owns Cognito, auth-domain tables, and rollback control-plane routes
as migration debt. Do not treat platform auth ownership as the target topology.

## Workspace configuration

`pnpm-workspace.yaml` declares the following workspace globs:

- `apps/*` — direct children only (does not include nested workspaces)
- `apps/launchpad/functions/*` — explicit nested glob for launchpad
  control-plane Lambdas
- `apps/stock-analyser/functions/*` — explicit nested glob for stock
  analyser Lambdas
- `apps/budget-tracker/functions/*` — explicit nested glob for budget
  tracker Lambdas
- `packages/*`
- `packages/ui/*` — explicit nested glob for `packages/ui/` sub-packages
  (`ui-error-boundaries`, `ui-primitives`); `packages/ui/` is an org directory,
  not itself a package, so its children are not covered by `packages/*`
- `platform/functions/*`
- `platform/functions/auth/*` — explicit nested glob because `platform/functions/auth/`
  contains its own per-Lambda workspaces
- `infrastructure` (single workspace at root)
- `migration-utilities/infrastructure` — CDK stack package for the
  migrations namespace
- `migration-utilities/**` — pre-registered glob for future Lambda
  packages within the namespace (e.g. `migration-utilities/budget-tracker/transactions/`)


## Import rules

Cross-app imports are **forbidden** and (when the lint baseline allows)
enforced by `eslint-plugin-boundaries`. The current lint baseline
disables this rule pending an ESLint 10 / `eslint-plugin-boundaries`
compatibility fix; M7 re-enables it.

| From | Can import from | Cannot import from |
|---|---|---|
| `apps/stock-analyser/` | `packages/*` | `apps/budget-tracker/`, `apps/launchpad/` |
| `apps/budget-tracker/` | `packages/*` | `apps/stock-analyser/`, `apps/launchpad/` |
| `apps/launchpad/` | `packages/*` | `apps/stock-analyser/`, `apps/budget-tracker/` |
| `packages/*` | Other `packages/*` | `apps/*`, `platform/functions/*`, `infrastructure/*` |
| `infrastructure/*` | `platform/functions/*` (via file paths), `apps/*/functions/*` (via file paths) | `apps/*` source code |
| `platform/functions/*` | `packages/*` | `apps/*`, other `platform/functions/*` (each Lambda is independent) |

**Valid imports:**

```typescript
// Stock Analyser importing from a shared package
import { ApiClient } from '@transformotion/api-client'

// Lambda using shared middleware
import { withAuth } from '@transformotion/lambda-middleware'
```

**Invalid imports — CI will fail when lint is re-enabled:**

```typescript
// ❌ Stock Analyser importing from Budget Tracker
import { BudgetStore } from '../../budget-tracker/stores/use-budget-store'

// ❌ A package importing from an app
import { portfolioService } from '../../apps/stock-analyser/lib/services/portfolio'

// ❌ A Lambda importing from another Lambda
import { handler as accountHandler } from '../../accounts/handler'
```

## How deploys work

Push-triggered workflows are path-filtered by ownership boundary. Platform
deploys platform substrate only and does not trigger app or migration utility
deployments. Changes to one app never trigger another app's deployment. The
manual `cd.yml` workflow remains the explicit full redeploy escape hatch.

| Changed path | Workflow triggered |
|---|---|
| `apps/stock-analyser/**` | `deploy-stock-analyser.yml` |
| `apps/stock-analyser/infrastructure/**` | `deploy-stock-analyser.yml` |
| `apps/budget-tracker/**` | `deploy-budget-tracker.yml` |
| `apps/budget-tracker/infrastructure/**` | `deploy-budget-tracker.yml` |
| `apps/launchpad/**` | `deploy-launchpad.yml` |
| `.github/workflows/deploy-launchpad.yml` | `deploy-launchpad.yml` |
| `platform/infrastructure/**` | `deploy-platform.yml` |
| `infrastructure/bin/platform.ts` | `deploy-platform.yml` |
| `infrastructure/bin/launchpad.ts` | `deploy-launchpad.yml` |
| `infrastructure/lib/**` | `deploy-launchpad.yml` when Launchpad CDK imports shared infrastructure helpers |
| `platform/config/app-registry.json` | `deploy-launchpad.yml` when Launchpad control-plane stacks consume app registry metadata |
| `infrastructure/bin/stock-analyser.ts` | `deploy-stock-analyser.yml` |
| `infrastructure/bin/budget-tracker.ts` | `deploy-budget-tracker.yml` |
| `infrastructure/bin/migration-utilities.ts` | `deploy-migration-utilities.yml` |
| `platform/functions/**` | `deploy-platform.yml` |
| `migration-utilities/**` | `deploy-migration-utilities.yml` |
| `packages/**` | Shared package changes trigger app/migration deploy workflows where their path filters include the touched package. `deploy-launchpad.yml` includes Launchpad frontend/control-plane package dependencies explicitly. `deploy-budget-tracker.yml` is active and includes the Budget Tracker package dependencies explicitly. |

Launchpad deploys all `Transformotion{Stage}-Launchpad*` stacks from
`infrastructure/bin/launchpad.ts`. Future #386 auth-domain stacks must follow
that naming pattern and deploy through `deploy-launchpad.yml`; Platform deploy
must not orchestrate Launchpad auth/control-plane resources.

Path filter completeness is not yet verified for `.github/workflows/**`
and `scripts/ci/**` — changes to CI machinery may not auto-trigger the
workflows they modify. M14 covers this.

## Adding a new app

The full canonical procedure is in `CONTRIBUTING.md` Section 3. The
mechanical steps within this monorepo are:

1. Create `apps/<app-name>/` with its own `package.json`
   (`@transformotion/<app-name>`).
2. Add an `AGENTS.md` at `apps/<app-name>/AGENTS.md` and a semantically
   equivalent `CLAUDE.md` compatibility mirror per `CONTRIBUTING.md`
   Section 2.3.
3. Add the app's normative contracts at `contracts/<app-name>/` —
   *not* at `apps/<app-name>/contracts/`. Per-app contract mirrors are
   forbidden per `CONTRIBUTING.md` Section 3.5.
4. Add CDK stacks in `apps/<app-name>/infrastructure/`.
5. Create `infrastructure/bin/{app-name}.ts` containing only the new app's stacks, resolving shared platform resources via `cdk.Fn.importValue`.
6. Add Lambda source at `apps/<app-name>/functions/`. Register the
   nested workspace glob in `pnpm-workspace.yaml` if Lambdas are
   workspaces themselves.
7. Add a deployment workflow at `.github/workflows/deploy-<app-name>.yml`.
8. Add a `CODEOWNERS` entry for `apps/<app-name>/`.
9. Create a corresponding GitHub Milestone if onboarding the app is
   substantive enough to warrant phased work, per `CONTRIBUTING.md`
   Section 4.4's milestone pairing rule.

## Adding a shared package

1. Create `packages/<package-name>/` with `package.json`
   (`@transformotion/<package-name>`).
2. Export from `src/index.ts`.
3. Add to consuming app's `package.json` as
   `"@transformotion/<package-name>": "workspace:*"`.
4. Add a `CODEOWNERS` entry for `packages/<package-name>/`.

UI packages live under `packages/ui/<concern>/` per `CONTRIBUTING.md`
Section 3.4 (e.g., `packages/ui/primitives/`,
`packages/ui/error-boundaries/`). `packages/ui/` is purely
organisational, not itself a package.

## Common gotchas

- **CDK paths.** Lambda entry paths in CDK stacks use `path.join(__dirname, ...)`.
  Platform stacks are at `platform/infrastructure/` and reference
  `platform/functions/` via `'../functions/<name>'`. App stacks are at
  `apps/<app>/infrastructure/` and reference `apps/<app>/functions/` via
  `'../functions/<name>'`. Double-check the depth when adding new stacks.

- **pnpm workspace globs.** `apps/*` matches direct children only.
  Nested workspaces (like `apps/stock-analyser/functions/*` and
  `platform/functions/auth/*`) need explicit globs in `pnpm-workspace.yaml`.

- **App-owned REST APIs.** Stock Analyser owns its REST API Gateway after
  #366. Budget Tracker owns its REST API Gateway and AI proxy runtime after
  #367. The shared platform API Gateway remains deployed for platform routes,
  rollback, and later #372 decommissioning of legacy app runtime paths; it is
  not the desired pattern for new app runtime work.

- **Stock Analyser WSS and AI runtime.** `apps/stock-analyser`
  owns `sa-ws-stack.ts`, WS handler packages under
  `apps/stock-analyser/functions/ws-*`, and
  `apps/stock-analyser/functions/ai-proxy` after #366. Live Stock
  Analyser AI uses Stock Analyser-owned REST, WSS, job-results, and
  AI runtime; platform runtime remains only for rollback and later
  decommissioning.

- **Budget Tracker WSS and AI runtime.** `apps/budget-tracker`
  owns `bt-ws-stack.ts`, WS handler packages under
  `apps/budget-tracker/functions/ws-*`, and
  `apps/budget-tracker/functions/ai-proxy` after #367. Live Budget Tracker
  AI review uses Budget Tracker-owned REST, WSS, `budget-tracker.ai-jobs`,
  and AI runtime; platform runtime remains only for rollback and later
  decommissioning.

- **Analysis cache table.** The `platform.analysis-cache` table is
  used by stock-analyser via the legacy platform claude-proxy Lambda. Despite the
  `platform.` prefix it is functionally stock-analyser data; M2.1
  ratifies the reclassification as a Stage 0b decision.

- **`packages/ui/` sub-packages.** `packages/ui/` is an organisational
  directory, not itself a package. Sub-packages: `@transformotion/ui-error-boundaries`
  (houses `TabErrorBoundary`) and `@transformotion/ui-primitives` (56 shadcn
  components + hooks; fully populated by M7 #298/#299/#300). `packages/cycle-engine/` was deleted —
  its implementation migrated to `apps/stock-analyser/lib/cycle/`.
