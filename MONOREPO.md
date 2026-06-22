# Transformotion Apps - Monorepo Guide

This document describes the repository's current structure, import boundaries,
and deployment machinery. For workflow rules and the discipline rule, see
[`CONTRIBUTING.md`](./CONTRIBUTING.md). For architecture details, see
[`docs/architecture/`](./docs/architecture/).

## Current Structure

```text
transformotion-apps/
  apps/
    launchpad/
      app/                         Next.js frontend
      functions/                   Launchpad auth/control-plane Lambdas
      infrastructure/              LaunchpadAuth and LaunchpadControlPlane
      AGENTS.md / CLAUDE.md
    stock-analyser/
      app/                         Next.js frontend
      functions/                   App-owned REST/WSS/AI Lambdas
      infrastructure/              StockAnalyser tables, API, WSS
      AGENTS.md / CLAUDE.md
    budget-tracker/
      app/                         Next.js frontend
      functions/                   App-owned REST/WSS/AI Lambdas
      infrastructure/              BudgetTracker tables, API, WSS
      AGENTS.md / CLAUDE.md
  packages/                        Shared libraries used by apps/Lambdas
    brand-tokens/                  Compile-time Transformotion brand tokens
  platform/
    infrastructure/                Neutral substrate CDK stacks only
    AGENTS.md / CLAUDE.md
  infrastructure/
    bin/                           CDK entrypoints per owner
  migration-utilities/
    infrastructure/                Migration utility API stack
  contracts/                       Normative contracts by scope
  docs/architecture/               Current architecture documentation
  migration-artifacts/             Historical data fixtures
```

## Ownership Model

| Owner | Owns |
|---|---|
| Platform | CloudFront/S3 hosting substrate, DNS/ACM integration, shared storage/deploy foundations, GitHub Actions deploy roles |
| Launchpad | Cognito User Pool, Hosted UI, app clients, groups, social IdP configuration, auth tables, pre-token trigger, auth/control-plane APIs, Launchpad frontend |
| Stock Analyser | REST API, WSS API, AI runtime, app tables, frontend, deployment |
| Budget Tracker | REST API, WSS API, AI runtime, app tables, frontend, deployment |
| Migration Utilities | Migration API and migration-specific infrastructure |

Platform does not own auth-domain resources, app runtime resources, app APIs,
shared WSS, or shared AI runtime.

During the Platform auth decommission PR, `infrastructure/bin/platform.ts`
synthesizes empty legacy stack placeholders for the old Platform auth/API/WSS
stack names. Deploying those empty templates deletes the old CloudFormation
resources. They are not live ownership surfaces.

## Workspace Configuration

`pnpm-workspace.yaml` declares:

- `apps/*`
- `apps/launchpad/functions/*`
- `apps/stock-analyser/functions/*`
- `apps/budget-tracker/functions/*`
- `packages/*`
- `packages/ui/*`
- `infrastructure`
- `migration-utilities/infrastructure`
- `migration-utilities/**`

There are no Platform Lambda workspaces.

## Import Rules

| From | Can import from | Cannot import from |
|---|---|---|
| `apps/<app>/` | `packages/*` | sibling apps |
| `apps/<app>/functions/*` | `packages/*` | sibling apps/functions |
| `packages/*` | other `packages/*` | `apps/*`, `platform/*`, `infrastructure/*` |
| `infrastructure/*` | app/platform stack modules and Lambda entry paths | app frontend/domain source |
| `platform/infrastructure/*` | CDK and shared infrastructure helpers | app implementation code |

## CDK Entrypoints

| Entrypoint | Stacks |
|---|---|
| `infrastructure/bin/platform.ts` | `Transformotion-GithubActionsRole`, `Transformotion{Stage}-Storage`, `Transformotion{Stage}-Network`, empty legacy decommission placeholders |
| `infrastructure/bin/launchpad.ts` | `Transformotion{Stage}-LaunchpadAuth`, `Transformotion{Stage}-LaunchpadControlPlane` |
| `infrastructure/bin/stock-analyser.ts` | `Transformotion{Stage}-StockAnalyser*` |
| `infrastructure/bin/budget-tracker.ts` | `Transformotion{Stage}-BudgetTracker*` |
| `infrastructure/bin/migration-utilities.ts` | `Transformotion{Stage}-Migrations*` |

## Deployment Boundaries

Push-triggered workflows are path-filtered by ownership boundary. Platform
deploys substrate only and does not trigger app or migration utility deploys.
The manual `cd.yml` workflow remains the explicit full redeploy escape hatch.

| Changed path | Workflow |
|---|---|
| `apps/launchpad/**` except documentation-only app files | `deploy-launchpad.yml` |
| `infrastructure/bin/launchpad.ts` | `deploy-launchpad.yml` |
| `.github/workflows/deploy-launchpad.yml` | `deploy-launchpad.yml` |
| `packages/brand-tokens/**` except documentation-only package files | `deploy-launchpad.yml` |
| `apps/stock-analyser/**` except documentation-only app files | `deploy-stock-analyser.yml` |
| `infrastructure/bin/stock-analyser.ts` | `deploy-stock-analyser.yml` |
| `.github/workflows/deploy-stock-analyser.yml` | `deploy-stock-analyser.yml` |
| `packages/brand-tokens/**` except documentation-only package files | `deploy-stock-analyser.yml` |
| `apps/budget-tracker/**` except documentation-only app files | `deploy-budget-tracker.yml` |
| `infrastructure/bin/budget-tracker.ts` | `deploy-budget-tracker.yml` |
| `.github/workflows/deploy-budget-tracker.yml` | `deploy-budget-tracker.yml` |
| `packages/brand-tokens/**` except documentation-only package files | `deploy-budget-tracker.yml` |
| `platform/infrastructure/**` | `deploy-platform.yml` |
| `infrastructure/bin/platform.ts` | `deploy-platform.yml` |
| `migration-utilities/**` except documentation-only utility files | `deploy-migration-utilities.yml` |
| `infrastructure/bin/migration-utilities.ts` | `deploy-migration-utilities.yml` |
| `.github/workflows/deploy-migration-utilities.yml` | `deploy-migration-utilities.yml` |

Shared package changes trigger the app/migration workflows whose path filters
include the touched package, except package documentation-only files such as
`README.md`, `AGENTS.md`, `CLAUDE.md`, and `docs/**`.
`packages/brand-tokens/**` is an active-app dependency path for Launchpad,
Stock Analyser, and Budget Tracker so future brand-token changes deploy the
apps that consume the canonical M18 brand layer.

## Adding Code

- New app runtime code belongs in `apps/<app>/`.
- New auth/control-plane behavior belongs in `apps/launchpad/`.
- New neutral substrate belongs in `platform/infrastructure/`.
- New shared code belongs in `packages/` only when it is genuinely shared.
- New migration utilities belong in `migration-utilities/`.
- New app infrastructure lives in `apps/<app>/infrastructure/` and is wired
  from the matching `infrastructure/bin/<app>.ts` entrypoint.

Update this document with any repository topology, import boundary, or deploy
boundary change.
