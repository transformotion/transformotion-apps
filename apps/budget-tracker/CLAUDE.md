# Budget Tracker - Claude Code compatibility mirror

`apps/budget-tracker/AGENTS.md` is the authoritative Budget Tracker agent guide.
This file is maintained for Claude Code compatibility and must remain
semantically equivalent. Any instruction added, removed, or modified in
`AGENTS.md` must be reflected here in the same PR.

Read this file before any Budget Tracker work. Read the root `AGENTS.md` for branching strategy, architecture governance, and operating mode.

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
| Canonical Budget Tracker contracts | [packages/contracts/src/budget-tracker](/packages/contracts/src/budget-tracker) and [packages/contracts/spec/budget-tracker](/packages/contracts/spec/budget-tracker) |

## CDK stacks owned

| Stack | Contents |
|---|---|
| `Transformotion{Stage}-BudgetTrackerTables` | `budget-tracker.accounts`, `budget-tracker.transactions`, `budget-tracker.rules`, `budget-tracker.settings` |
| `Transformotion{Stage}-BudgetTrackerApi` | Budget Tracker-owned REST API Gateway, Lambda functions, and AI proxy runtime |
| `Transformotion{Stage}-BudgetTrackerWs` | Budget Tracker WebSocket API, WS Lambdas, and `budget-tracker.ws-connections-{stage}` |

Source: `apps/budget-tracker/infrastructure/`

The WebSocket stack is Budget Tracker-owned: `Transformotion{Stage}-BudgetTrackerWs` in `apps/budget-tracker/infrastructure/bt-ws-stack.ts`. BT may still send `?app=budget-tracker` during transition, but the app-owned authoriser only permits Budget Tracker scope.

> Current state after #367/#386: Budget Tracker owns its REST API Gateway and AI runtime. Authentication is issued by LaunchpadAuth. The shared platform API Gateway and legacy platform Claude proxy remain deployed only as decommission debt.

## Lambda functions

| Lambda | Routes |
|---|---|
| `budget-transactions-handler-{stage}` | `GET/POST/PATCH/DELETE /api/budget/v1/transactions` |
| `budget-rules-handler-{stage}` | `GET/POST/PATCH/DELETE /api/budget/v1/rules` |
| `budget-settings-handler-{stage}` | `GET/PATCH /api/budget/v1/settings` |
| `budget-ai-handler-{stage}` | `POST /api/budget/v1/ai/review`, `POST /api/budget/v1/ai/csv-analysis` |
| `budget-tracker-ai-proxy-{stage}` | Invoked synchronously by `budget-ai-handler-{stage}` for Anthropic calls |
| `budget-data-handler-{stage}` | `GET/PATCH /api/budget/v1/budget-data` |
| `budget-export-handler-{stage}` | `GET /api/budget/v1/business-export` |

## WebSocket

Budget Tracker uses its own WebSocket (`budget-tracker-ws-{stage}`). The 4 WS Lambdas live in `apps/budget-tracker/functions/ws-*/` and are documented in `docs/architecture/cdk.md`. BT connects with `?app=budget-tracker&accountId=...&token=...` during transition and receives AI review batch results on `$default`.

The connections DynamoDB table is `budget-tracker.ws-connections-{stage}`. `BudgetTrackerApiStack` receives `wsConnectionsTableName` and `wsApiId` from `BudgetTrackerWsStack`, and `budget-ai-handler-{stage}` uses those values for connection lookup and `execute-api:ManageConnections` pushes.

## DynamoDB tables

| Table | PK | SK | Purpose |
|---|---|---|---|
| `budget-tracker.accounts-{stage}` | `accountId` | — | Budget Tracker account container |
| `budget-tracker.transactions-{stage}` | `accountId` | `transactionId` | Transactions; GSI: `accountId-dateIso-index` |
| `budget-tracker.rules-{stage}` | `accountId` | `ruleId` | Custom categorisation rules |
| `budget-tracker.settings-{stage}` | `accountId` | `settingKey` | Per-account settings (key-value) |

WebSocket connection state is in `budget-tracker.ws-connections-{stage}` (owned by `BudgetTrackerWsStack`).

## Authorization requirement

All Lambda handlers use helpers from `packages/lambda-middleware`. App-data routes use the **data-authority factory** `requireAccountData` (D9, M16); supervisory/ownership routes use `requireAccountAdmin`:

```typescript
const btData = requireAccountData('budget-tracker');               // module scope

btData.read(auth, accountId);                                      // read tier — claims only, viewer passes
await btData.write(auth, accountId, membershipLoader);            // write tier — claims + live members row, viewer denied
requireAccountAdmin(/* owner / manager / supervisory guards */);  // supervisory & ownership ops
requireSiteAdmin(auth);                                            // platform admin ops only
```

Construct `requireAccountData('budget-tracker')` at module scope, then call `.read` on GET branches and `.write` (with a `dynamoMembershipLoader`) before each mutation. There is **no site-admin data bypass** — membership is the only grant of data authority. `requireAccountAccess` and `requireAccountOwner` were **deleted** in M16 Phase 5. Do not call `requireGroup` directly. See [auth.md](/docs/architecture/auth.md) and [route-classification-m16.md](/docs/architecture/route-classification-m16.md).

## Adaptor pattern — mandatory constraint

Budget Tracker UI uses the adaptor pattern. **Components never call APIs, DynamoDB, or localStorage directly.** The data flow is:

```
Component
  → Zustand store action
  → Repository interface method   ← defined in packages/contracts
  → stub adaptor (dev/v0) OR aws-adaptor (production)
```

The three Zustand stores:
- `useBudgetStore` — transactions, rules, settings, categorisation actions
- `useAiStore` — AI review queue and CSV analysis
- `useAuthStore` — current user and sign-in/out

Repository interfaces are defined in the repo-owned `packages/contracts/src/budget-tracker/` scope. **Do not add methods to a repository without updating `packages/contracts/` and running `pnpm check:contracts`.**

### Forbidden patterns

- `fetch()` in components or store actions
- `localStorage` reads/writes outside `lib/repositories/`
- UI/backend boundary types not sourced from `@transformotion/contracts`
- `window.confirm` — use inline confirmation UI instead
- IIFEs inside JSX — compute values above the return statement
- `URL.createObjectURL` for CSV export — use data URI instead
- AI prompt text in client-side code — prompts run server-side only
- Imports from `apps/stock-analyser/`

## Data types

Types that cross the UI/backend boundary are defined in the repo-owned [packages/contracts/src/budget-tracker/](/packages/contracts/src/budget-tracker/) scope. Key types:
- `Transaction` — atomic unit; `_manual` flag prevents rules from overwriting; `categoryId`/`subcategoryId` are UUID FKs; deprecated `category`/`subcategory` string fields remain for migration fallback display
- `MatchingRule` — user-managed keyword/regex rule referencing `categoryId`/`subcategoryId` UUIDs; sorted by `priority` (lower = higher priority); replaces the old `CustomRule` + `BuiltinRule` split (there are no built-in rules)
- `BudgetData` — `{ categories: Category[], budgetAmounts: Record<subcategoryId, number>, budgetFrequencies: Record<subcategoryId, BudgetFrequency> }`; stored as a single `budgetData` key in the settings table
- `BudgetSettings` — slim; only `csvFormatMappings: Record<string, CSVMapping>` remains
- `Category` — `{ categoryId, name, type: 'regular'|'capital', subcategories: Subcategory[], deleted? }`; `type='capital'` marks project/one-off spend excluded from cashflow

## Exclusion rules (apply everywhere)

A transaction is **excluded from personal cashflow** if any of these are true:
1. `subcategory === "Transfer"` (checked via `isTransfer(subcategory)`)
2. `_business === true`
3. The transaction's resolved category has `type === 'capital'` (replaces the old `PROJECT_CATEGORIES` / `PROJECT_SUBCATEGORIES` string lists)

Capital categories cover one-off or project spending (renovations, car purchases, etc.) and appear as a dedicated section in the Budget tab. These exclusions must be consistent across Summary totals, Budget view, Cashflow charts, and the Sankey diagram. Excluded transactions remain visible in the Transactions tab.

## Rules engine

There are no built-in rules. All rules are user-managed `MatchingRule` objects with UUID category/subcategory FKs. Process order:

1. If `_manual === true`: return existing category unchanged
2. Sort enabled rules ascending by `priority` (lower number = higher priority); apply first case-insensitive match against `description`
3. `applyRules(description, rules)` returns `{ categoryId, subcategoryId, ruleId, isBusiness? } | null`
4. Return `null` if no match — transaction remains uncategorized

**Critical ordering:** Never run the rules engine before rules are loaded. Load order: auth → settings → rules → transactions → run rules.

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
3. `isExcludedFromCashflow()` always excludes Transfer, `_business`, and `type='capital'` categories
4. `buildMonthlyTrend()` net = income − expenses (exact equality)
5. Migration endpoint strips legacy integer `_id` from v0 export before writing to DynamoDB; Transfer subcategory transactions are routed to the Transfer subcategory (identified by `excludeFromCashflow: true`)
6. `getSubcategoryMonthlyBudget()` returns 0 for soft-deleted subcategories (`sub.deleted === true`)

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
2. Update the contract in `packages/contracts/`, then run `pnpm check:contracts`
3. Add a matching Lambda route to `apps/budget-tracker/functions/budget-ai/src/index.ts` gated by `requireAccountData('budget-tracker').write` (AI routes are member-tier, owner ruling #1)
4. Implement the method in `MockAIService` (mock-ai.ts) and `ClaudeAIService` (claude-ai.ts)
5. Add prompt text in the Lambda (server-side only — never in client code)

AI flows use `getAIService()` directly from components.

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

Environment: copy `apps/budget-tracker/.env.example` to `.env.local` and fill in values.

## Environment variables (relevant subset)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` | Cognito app client for this app (GitHub Actions variable) |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Generic runtime name for the Cognito client ID — set in `.env.local` for local dev |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Shared Cognito user pool ID |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Hosted UI domain |
| `NEXT_PUBLIC_RUNTIME_PROFILE` | `mock` (default; local development) or `live` (deployed environments). Determines defaults for auth, data, AI, and future concerns. See root `AGENTS.md` for the design map. |
| `NEXT_PUBLIC_API_URL` | Budget Tracker-owned API Gateway base URL; deploy workflow extracts it from `Transformotion{Stage}-BudgetTrackerApi` |
| `NEXT_PUBLIC_BT_WSS_URL` | Budget Tracker-owned WebSocket URL for AI review streaming; deploy workflow extracts it from `Transformotion{Stage}-BudgetTrackerWs` |

**Cognito client variable rebind:** The GitHub Actions variable `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` is mapped to the generic runtime env var `NEXT_PUBLIC_COGNITO_CLIENT_ID` in the deploy workflow's env block. This allows each app to have its own Cognito App Client (established in sub-phase 7b.5-alpha) while the runtime code (`@transformotion/auth-client`) reads a single generic name. Local development reads `NEXT_PUBLIC_COGNITO_CLIENT_ID` directly from `.env.local`.
