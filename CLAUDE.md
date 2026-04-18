# Transformotion Apps — Claude Code Instructions

## Repo overview

This is the authoritative monorepo for the Transformotion platform. It contains:

- `apps/web/` — Next.js frontend (static export → S3 + CloudFront)
- `infra/` — AWS CDK infrastructure
- `functions/` — Lambda function handlers
- `budget-tracker/contracts/` — Budget Tracker interface contracts (see below)
- `packages/` — Shared packages (e.g. `@transformotion/lambda-middleware`)

**Live deployments:**
- Dev: `dev.apps.transformotion.com.au` — deploys from `develop` branch via GitHub Actions
- Prod: `apps.transformotion.com.au` — deploys from `main` branch

---

## Branching strategy

- `main` — production. Never commit directly.
- `develop` — integration branch. Never commit directly.
- Feature branches: `claude-code/<feature-name>` off `develop`, PR back to `develop`.
- v0 branches: `v0/<feature-name>` off `develop`, PR back to `develop`.
- After merge to `develop`, CD pipeline deploys to dev automatically.

---

## Budget Tracker contracts — READ BEFORE ANY BUDGET WORK

**`/budget-tracker/contracts/` is the single source of truth for how the Budget Tracker's UI and backend communicate.**

Before making ANY change that touches:

- A data shape crossing the UI/backend boundary → read `budget-tracker/contracts/data-models.md`
- An API call (real or stubbed) → read `budget-tracker/contracts/api-endpoints.md`
- State storage (Zustand, localStorage, cache) → read `budget-tracker/contracts/state-management.md`
- A Claude/AI call → read `budget-tracker/contracts/ai-prompts.md`
- AWS infrastructure → read `budget-tracker/contracts/aws-infrastructure.md`
- Component structure, tabs, naming → read `budget-tracker/contracts/ui-patterns.md`

**When a contract needs to change:**

1. Update the relevant contract file FIRST
2. Add a dated entry to `budget-tracker/contracts/changelog.md`
3. Only then implement the code change
4. Sync `budget-tracker/contracts/` to `transformotion-apps-b8` before the next v0 session

**Never invent types, endpoints, or state patterns not described in `/budget-tracker/contracts`.** If what you need isn't there, update the contract first, then implement.

---

## Stock Analyser (apps/web) data layer

For the Stock Analyser part of `apps/web/`, the data contracts live in:

- `apps/web/DATA_CONTRACTS.md` — service interfaces, hook signatures, type definitions, cache key conventions

The mock/real separation rule: components never check `useMockData` directly. Only service files and hooks do.

---

## Architecture patterns

### Lambda bundling
All Lambda functions use `forceDockerBundling: false` in CDK bundling config. This lets esbuild use the local node_modules and resolve workspace packages (`@transformotion/lambda-middleware`).

### Authentication
Always real Cognito — never mocked. `NEXT_PUBLIC_USE_MOCK_DATA` controls data layer only, not auth.

### Environment variables
`NEXT_PUBLIC_*` vars are baked in at Next.js build time. They must be set in the GitHub Actions environment before the build step runs.

### v0 collaboration
v0 owns UI components and styling. Claude Code owns data models, API contracts, AI prompts, state management patterns, AWS infrastructure, and adaptors. See `budget-tracker/contracts/README.md` for the full ownership model.
