# Budget Tracker — Claude Code operating guide

Read this file before any Budget Tracker work. Read the root `CLAUDE.md` for branching strategy.

## Overview

Next.js app at `apps/budget-tracker/`. Static export deployed to S3/CloudFront.  
Serves at `{host}/budget-tracker/*`.  
React + TypeScript + Tailwind CSS + shadcn/ui.

## Quick reference

| What | Value |
|---|---|
| basePath | `/budget-tracker` |
| Local dev port | `3002` |
| Deploy workflow | `.github/workflows/deploy-budget-tracker.yml` |
| Cognito client var | `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` |
| S3 prefix | `budget-tracker/` in `transformotion-web-{stage}-959516291617` |

## Architecture references

| Topic | Document |
|---|---|
| Auth model, groups, tokens, middleware | [/docs/architecture/auth.md](/docs/architecture/auth.md) |
| DynamoDB table schemas | [/docs/architecture/data.md](/docs/architecture/data.md) |
| CDK stacks, Lambda names | [/docs/architecture/cdk.md](/docs/architecture/cdk.md) |
| URL routing, CloudFront, deploy triggers | [/docs/architecture/urls-and-deploy.md](/docs/architecture/urls-and-deploy.md) |
| Data models and types | [/v0-reference/contracts/budget-tracker/data-models.md](/v0-reference/contracts/budget-tracker/data-models.md) |
| API contracts | [/v0-reference/contracts/budget-tracker/api-endpoints.md](/v0-reference/contracts/budget-tracker/api-endpoints.md) |
| State management and adaptor pattern | [/v0-reference/contracts/budget-tracker/state-management.md](/v0-reference/contracts/budget-tracker/state-management.md) |
| AWS infrastructure reference | [/v0-reference/contracts/budget-tracker/aws-infrastructure.md](/v0-reference/contracts/budget-tracker/aws-infrastructure.md) |

## CDK stacks owned

| Stack | Contents |
|---|---|
| `Transformotion{Stage}-BudgetTrackerTables` | `budget-tracker.accounts`, `budget-tracker.transactions`, `budget-tracker.rules`, `budget-tracker.settings` |
| `Transformotion{Stage}-BudgetTrackerApi` | All Budget Tracker Lambda functions + its own API Gateway |

Source: `infrastructure/lib/budget-tracker/`

> Note: Budget Tracker has its own API Gateway (`budget-tracker-api-{stage}`) rather than sharing the platform gateway. This is a known architectural divergence tracked as sub-phase 7f.

## Lambda functions

| Lambda | Routes |
|---|---|
| `budget-transactions-handler-{stage}` | `GET/POST/PATCH/DELETE /api/budget/v1/transactions` |
| `budget-rules-handler-{stage}` | `GET/POST/PATCH/DELETE /api/budget/v1/rules` |
| `budget-settings-handler-{stage}` | `GET/PATCH /api/budget/v1/settings` |
| `budget-ai-categorise-handler-{stage}` | `POST /api/budget/v1/ai/categorise` |
| `budget-ai-review-handler-{stage}` | `POST /api/budget/v1/ai/review` |
| `budget-ai-csv-analysis-handler-{stage}` | `POST /api/budget/v1/ai/csv-analysis` |
| `budget-export-handler-{stage}` | `GET /api/budget/v1/business-export` |

## DynamoDB tables

| Table | PK | SK | Purpose |
|---|---|---|---|
| `budget-tracker.accounts-{stage}` | `accountId` | — | Budget Tracker account container |
| `budget-tracker.transactions-{stage}` | `accountId` | `transactionId` | Transactions; GSI: `accountId-dateIso-index` |
| `budget-tracker.rules-{stage}` | `accountId` | `ruleId` | Custom categorisation rules |
| `budget-tracker.settings-{stage}` | `accountId` | `settingKey` | Per-account settings (key-value) |

## Authorization requirement

All Lambda handlers use helpers from `packages/lambda-middleware`. The four available helpers and when to apply each:

```typescript
requireSiteAdmin(auth)                                             // platform admin ops only
requireAppAccess(auth, 'budget-tracker')                          // entry-point check (every handler)
requireAccountAccess(auth, 'budget-tracker', accountId)           // standard read/write ops
requireAccountAccess(auth, 'budget-tracker', accountId, 'manager') // elevated ops (bulk delete, settings wipe, etc.)
requireAccountOwner(auth, 'budget-tracker', accountId)            // ownership-transfer ops
```

Call `requireAppAccess` at the top of every handler, then `requireAccountAccess` (or `requireAccountOwner`) before each DynamoDB operation. Do not call `requireGroup` directly. See [auth.md](/docs/architecture/auth.md) for full middleware helper documentation.

## Adaptor pattern — mandatory constraint

Budget Tracker UI uses the adaptor pattern. **Components never call APIs, DynamoDB, or localStorage directly.** The data flow is:

```
Component
  → Zustand store action
  → Repository interface method   ← defined in contracts/state-management.md
  → stub adaptor (dev/v0) OR aws-adaptor (production)
```

The three Zustand stores:
- `useBudgetStore` — transactions, rules, settings, categorisation actions
- `useAiStore` — AI review queue and CSV analysis
- `useAuthStore` — current user and sign-in/out

Repository interfaces are defined in `v0-reference/contracts/budget-tracker/state-management.md`. **Do not add methods to a repository without updating the contract file in the v0 repo first, then re-running `scripts/sync-v0.sh`.**

### Forbidden patterns

- `fetch()` in components or store actions
- `localStorage` reads/writes outside `lib/repositories/`
- Types not in `v0-reference/contracts/budget-tracker/data-models.md`
- `window.confirm` — use inline confirmation UI instead
- IIFEs inside JSX — compute values above the return statement
- `URL.createObjectURL` for CSV export — use data URI instead
- AI prompt text in client-side code — prompts run server-side only
- Imports from `apps/stock-analyser/`

## Data types

All types that cross the UI/backend boundary are defined in [v0-reference/contracts/budget-tracker/data-models.md](/v0-reference/contracts/budget-tracker/data-models.md). Key types:
- `Transaction` — atomic unit; `_manual` flag prevents rules from overwriting
- `CustomRule` — keyword or regex pattern, case-insensitive
- `BudgetSettings` — per-account, stored key-by-key in DynamoDB
- `BuiltinRule` — compiled into codebase, not user-editable, not stored in DynamoDB

## Exclusion rules (apply everywhere)

A transaction is **excluded from personal P&L** if any of these are true:
1. `subcategory === "Transfer"`
2. `_business === true`
3. `category` is in `PROJECT_CATEGORIES` (default: `["Renovations"]`)
4. `subcategory` is in `PROJECT_SUBCATEGORIES` (default: `["Capital purchases"]`)

These exclusions must be consistent across Summary totals, Budget view, Cashflow charts, and the Sankey diagram. Excluded transactions remain visible in the Transactions tab.

## Rules engine

Custom rules override built-in rules. Most recent custom rule wins if multiple match. Process order:

1. If `_manual === true`: return existing category unchanged
2. Iterate custom rules in reverse (most recent first) — case-insensitive match
3. Iterate built-in rules
4. Return `{ category: "", subcategory: "" }` if no match

**Critical ordering:** Never run the rules engine before custom rules are loaded. Load order: auth → settings → rules → transactions → run rules.

## Testing

Domain logic lives in `packages/budget-domain/` — pure TypeScript, no AWS dependencies. Run tests with:

```bash
cd packages/budget-domain
pnpm test
```

Real export fixture: `migration-artifacts/budget-tracker/budget-tracker-export-2026-04-18.json` (732 transactions).

Key invariants to preserve in tests:
1. `Transaction.transactionId` is always a UUID string
2. `buildBudgetVsActual()` numMonths matches the transaction date range
3. `isExcludedFromCashflow()` always excludes Transfer, `_business`, project categories
4. `buildMonthlyTrend()` net = income − expenses (exact equality)
5. Migration endpoint strips legacy integer `_id` from v0 export before writing to DynamoDB; Transfer subcategory transactions get `_ignore: true`
6. `getSubcategoryMonthlyBudget()` returns 0 for tombstoned subcategories (override = -1)

## AI service

Budget Tracker has its own AI service layer at `lib/services/ai/`:

| File | Purpose |
|---|---|
| `index.ts` | `AIService` interface (`reviewTransactions`, `analyseCsvFormat`); `getAIService()` singleton |
| `mock-ai.ts` | `MockAIService` — keyword-based mock for local dev |
| `claude-ai.ts` | `ClaudeAIService` — calls `budget-ai` Lambda routes (`/api/budget/v1/ai/*`) via `getBudgetHttp()` |

Provider is selected via `config.ai.provider` (`'mock'` or `'claude'`), resolved from `NEXT_PUBLIC_AI_OVERRIDE` / `NEXT_PUBLIC_RUNTIME_PROFILE`.

**Adding a new AI feature:**
1. Add the method to the `AIService` interface in `lib/services/ai/index.ts`
2. Update the contract in the v0 repo (`transformotion-apps-b8/contracts/budget-tracker/state-management.md`) and re-run `scripts/sync-v0.sh`
3. Add a matching Lambda route to `functions/budget-ai/src/index.ts` with `requireAppAccess` + `requireAccountAccess`
4. Implement the method in `MockAIService` (mock-ai.ts) and `ClaudeAIService` (claude-ai.ts)
5. Add prompt text in the Lambda (server-side only — never in client code)

AI flows use `getAIService()` directly from components (not `useClaude`). The `useClaude` hook in `lib/hooks/use-claude.ts` is legacy and should not be used for new features.

## v0 origins

The Budget Tracker UI was originally built with v0 using the adaptor pattern described in `handover/v0-prompt.md`. When continuing UI work in v0:
- Read `handover/v0-prompt.md` for v0-specific operating conventions
- The stub adaptors (in-memory + localStorage) live in the v0 repo (`transformotion-apps-b8`)
- The real AWS adaptors live here

## Local development

```bash
pnpm --filter @transformotion/budget-tracker dev
# Runs on http://localhost:3002
```

Environment: copy `apps/budget-tracker/.env.example` to `.env.local` and fill in values. Set `NEXT_PUBLIC_USE_MOCK_DATA=true` to use stub adaptors without real AWS.

## Environment variables (relevant subset)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` | Cognito app client for this app (GitHub Actions variable) |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Generic runtime name for the Cognito client ID — set in `.env.local` for local dev |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Shared Cognito user pool ID |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Hosted UI domain |
| `NEXT_PUBLIC_RUNTIME_PROFILE` | `mock` (default; local development) or `live` (deployed environments). Determines defaults for auth, data, AI, and future concerns. See root `CLAUDE.md` for the design map. |
| `NEXT_PUBLIC_USE_MOCK_DATA` | `true` = stub adaptors, `false` = real AWS |
| `NEXT_PUBLIC_API_BASE_URL` | Budget Tracker API base URL |

**Cognito client variable rebind:** The GitHub Actions variable `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` is mapped to the generic runtime env var `NEXT_PUBLIC_COGNITO_CLIENT_ID` in the deploy workflow's env block. This allows each app to have its own Cognito App Client (established in sub-phase 7b.5-alpha) while the runtime code (`@transformotion/auth-client`) reads a single generic name. Local development reads `NEXT_PUBLIC_COGNITO_CLIENT_ID` directly from `.env.local`.
