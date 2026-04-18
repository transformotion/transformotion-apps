# Transformotion Apps — Claude Code Instructions

## Repo overview

This is the authoritative monorepo for the Transformotion platform. It contains:

- `apps/stock-analyser/` — Stock Analyser Next.js frontend (static export → S3 + CloudFront)
- `apps/budget-tracker/` — Budget Tracker app (UI shell placeholder; backend TBD)
- `infrastructure/` — AWS CDK infrastructure (platform + per-app stacks)
- `functions/` — Lambda function handlers
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

**`apps/budget-tracker/contracts/` is the single source of truth for how the Budget Tracker's UI and backend communicate.**

Before making ANY change that touches:

- A data shape crossing the UI/backend boundary → read `apps/budget-tracker/contracts/data-models.md`
- An API call (real or stubbed) → read `apps/budget-tracker/contracts/api-endpoints.md`
- State storage (Zustand, localStorage, cache) → read `apps/budget-tracker/contracts/state-management.md`
- A Claude/AI call → read `apps/budget-tracker/contracts/ai-prompts.md`
- AWS infrastructure → read `apps/budget-tracker/contracts/aws-infrastructure.md`
- Component structure, tabs, naming → read `apps/budget-tracker/contracts/ui-patterns.md`

**When a contract needs to change:**

1. Update the relevant contract file FIRST
2. Add a dated entry to `apps/budget-tracker/contracts/changelog.md`
3. Only then implement the code change
4. Sync `apps/budget-tracker/contracts/` to `transformotion-apps-b8` before the next v0 session

**Never invent types, endpoints, or state patterns not described in `apps/budget-tracker/contracts`.** If what you need isn't there, update the contract first, then implement.

---

## Stock Analyser contracts — READ BEFORE ANY STOCK ANALYSER WORK

**`apps/stock-analyser/contracts/` is the single source of truth for Stock Analyser UI/backend contracts.**

Before making ANY change that touches the stock analyser data layer, read:

- `apps/stock-analyser/contracts/DATA_CONTRACTS.md` — service interfaces (`portfolioService`, `watchlistService`), hook signatures (`useClaude`, `useNavigation`), type definitions, cache key conventions, and the prompt-detection → return-type mapping

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
v0 owns UI components and styling. Claude Code owns data models, API contracts, AI prompts, state management patterns, AWS infrastructure, and adaptors. See `apps/budget-tracker/contracts/README.md` for the full ownership model.
