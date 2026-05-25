# Stock Analyser — Claude Code operating guide

Read this file before any Stock Analyser work. Read the root `CLAUDE.md` for branching strategy.

## Overview

Next.js app at `apps/stock-analyser/`. Static export deployed to S3/CloudFront.  
Serves at `{host}/stock-analyser/*`.  
React + TypeScript + Tailwind CSS.

## Quick reference

| What | Value |
|---|---|
| basePath | `/stock-analyser` |
| Local dev port | `3000` |
| Deploy workflow | `.github/workflows/deploy-stock-analyser.yml` |
| Cognito client var | `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` |
| S3 prefix | `stock-analyser/` in `transformotion-web-{stage}-959516291617` |

## Architecture references

| Topic | Document |
|---|---|
| Auth model, groups, tokens, middleware | [/docs/architecture/auth.md](/docs/architecture/auth.md) |
| DynamoDB table schemas | [/docs/architecture/data.md](/docs/architecture/data.md) |
| CDK stacks, Lambda names | [/docs/architecture/cdk.md](/docs/architecture/cdk.md) |
| URL routing, CloudFront, deploy triggers | [/docs/architecture/urls-and-deploy.md](/docs/architecture/urls-and-deploy.md) |
| Stock Analyser API contracts and types | [contracts/stock-analyser/DATA_CONTRACTS.md](/contracts/stock-analyser/DATA_CONTRACTS.md) |
| Migration invariants from HTML version | [apps/stock-analyser/MIGRATION_INVARIANTS.md](./MIGRATION_INVARIANTS.md) |

## CDK stacks owned

| Stack | Contents |
|---|---|
| `Transformotion{Stage}-StockAnalyserTables` | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}`, `stock-analyser.analysis-cache-{stage}` |
| `Transformotion{Stage}-StockAnalyserApi` | All Stock Analyser Lambda functions + routes on the platform API Gateway |

Source: `apps/stock-analyser/infrastructure/`

## Lambda functions

All Stock Analyser Lambdas share the platform API Gateway and Cognito JWT authoriser.

| Lambda | Source | Routes |
|---|---|---|
| `transformotion-portfolio-{stage}` | `apps/stock-analyser/functions/portfolio` | `GET/POST/PATCH/DELETE /api/portfolio` |
| `transformotion-watchlist-{stage}` | `apps/stock-analyser/functions/watchlist` | `GET/POST/PATCH/DELETE /api/watchlist` |
| `transformotion-analysis-cache-{stage}` | `apps/stock-analyser/functions/analysis-cache` | `GET /api/analysis-cache/*` |
| `transformotion-cycle-check-{stage}` | `apps/stock-analyser/functions/cycle-check` | EventBridge scheduled (no HTTP route) |
| `transformotion-cycle-data-{stage}` | `apps/stock-analyser/functions/cycle-data` | `GET /cycle/ohlcv?ticker=` |

## DynamoDB tables

| Table | PK | SK | Purpose |
|---|---|---|---|
| `stock-analyser.portfolio-{stage}` | `accountId` | `ticker` | Portfolio holdings per account |
| `stock-analyser.watchlist-{stage}` | `accountId` | `ticker` | Watchlist items per account |
| `stock-analyser.analysis-cache-{stage}` | `accountId` | `cacheKey` | Claude analysis cache (TTL: expiresAt) |

Analysis cache is accessed by `transformotion-analysis-cache-{stage}` (read/delete). As of M7 / PR #334 (Bucket A'), async job records (`job-*` keys) are written by `claude-proxy` to `platform.job-results-{stage}` (not this table). The `analysis-cache` Lambda routes GET requests for `job-*` keys to that platform table; all other keys stay on this table.

## Authorization requirement

All Lambda handlers use helpers from `packages/lambda-middleware`. The four available helpers and when to apply each:

```typescript
requireSiteAdmin(auth)                                           // platform admin ops only
requireAppAccess(auth, 'stock-analyser')                          // entry-point check (every handler)
requireAccountAccess(auth, 'stock-analyser', accountId)           // standard read/write ops
requireAccountAccess(auth, 'stock-analyser', accountId, 'manager') // elevated ops (bulk delete, etc.)
requireAccountOwner(auth, 'stock-analyser', accountId)            // ownership-transfer ops
```

Call `requireAppAccess` at the top of every handler, then `requireAccountAccess` (or `requireAccountOwner`) before each DynamoDB operation. Do not call `requireGroup` directly. See [auth.md](/docs/architecture/auth.md) for full middleware helper documentation.

## Service layer and data contracts

The app uses a service-adaptor pattern: components call service methods → service handles mock vs real internally. Components never check provider flags directly.

Key service methods defined in [contracts/DATA_CONTRACTS.md](./contracts/DATA_CONTRACTS.md):
- `portfolioService.getHoldings()` / `saveHoldings()` / `enrichHoldings()`
- `watchlistService.getItems()` / `saveItems()`
- `useClaude()` hook — POST to `/api/claude` + async polling pattern

### Claude AI pattern

The `useClaude<T>()` hook handles the full async request cycle via the platform WebSocket:
1. Open platform WSS (`NEXT_PUBLIC_PLATFORM_WSS_URL`) with Cognito ID token and `?app=stock-analyser`
2. Send `{ action: 'init' }` → receive `{ type: 'connected', connectionId }`
3. POST to `/api/claude` with prompt + `connectionId` → returns `jobId`
4. Receive `{ type: 'job_complete' }` push on the WebSocket when the job finishes
5. Read result from `/analysis-cache/job-{jobId}` and return typed result

See `apps/stock-analyser/docs/claude-ai-pattern.md` for usage examples and configuration.

### Adding a new AI feature

Stock Analyser AI goes through `useClaude<T>()` or `callClaudeAPI<T>()` in `lib/hooks/use-claude.ts`.

1. Add mock fixture data to `lib/services/ai/fixtures/index.ts` (keyword-keyed, returned by `getMockResponse()`)
2. The `MockAIService` at `lib/services/ai/mock-ai.ts` uses `getMockResponse()` — no change needed unless the interface changes
3. `ClaudeAIService` at `lib/services/ai/claude-ai.ts` delegates to `callClaudeAPI` — no change needed for new prompts
4. Mock flag is `config.ai.provider === 'mock'` (set via `NEXT_PUBLIC_AI_OVERRIDE` / `NEXT_PUBLIC_RUNTIME_PROFILE`). Do not check `config.features.useMockData` for AI branching.

### Cache key conventions

| Data | Cache key format | TTL |
|---|---|---|
| Market Analysis | `MARKET#{geography}` | 24h |
| Recommendations | `RECS#{market}` | 24h |
| ETFs | `ETFS#{category}` | 48h |
| Metals | `METALS#all` | 2h |
| Stock Analysis | `ANALYSIS#{ticker}` | 8h |
| Market Cycle | `CYCLE#{geography}` | 8h |
| OHLCV Cycle Data | `OHLCV#{ticker}` | 1h |

## Cycle computation

### Fast mode (Standard)
Claude estimates `cyclePosition` (0–100), `cycleStage`, RSI divergence,
MACD momentum, and volume trend signals as part of the stock analysis
prompt. No OHLCV data is fetched; the values are AI-synthesised.

### Live mode
When the user toggles "Live mode" in the Analyser tab, the frontend calls
`GET /cycle/ohlcv?ticker=` via `useCycleData()` (in `lib/hooks/use-cycle-data.ts`).
The `cycle-data` Lambda fetches 1y of daily OHLCV from Yahoo Finance
(`yahoo-finance2`), runs `computeCyclePosition` (in `lib/cycle/index.ts`),
and caches the result under `OHLCV#{ticker}` with a 1h TTL.
The computed values overlay the AI estimates in `FullCycleGauge`. On 503 or
error the component falls back to the AI estimates with a "Live mode
unavailable" notice.

Both paths use the same `FullCycleGauge` component — do not modify it.

## Migration invariants (Phase 4)

When the monolithic `stock-signal-analyser.html` is migrated into this app (Phase 4), all 16 invariants in [MIGRATION_INVARIANTS.md](./MIGRATION_INVARIANTS.md) must be covered by automated tests. Do not declare Phase 4 complete until every invariant has a failing-then-passing test.

Key invariants:
1. Signal normalisation: `rawSig.trim().toUpperCase().startsWith('BUY')`
2. `computeLiveCycle` works without a DOM container
3. `isLive()` always exists and returns a boolean
4. Watchlist refresh uses `Promise.all` (not serial awaits)
5. Ticker matching by position before exact string equality
6. JSON parsing uses depth-tracking parser (not `JSON.parse`)
7. Prompts include "no emoji, JSON only"

## Local development

```bash
pnpm --filter @transformotion/stock-analyser dev
# Runs on http://localhost:3000
```

Environment: copy `apps/stock-analyser/.env.example` to `.env.local` and fill in values.

Required env vars marked `[REQUIRED]` in `.env.example` must be set before the dev server will function correctly.

## Environment variables (relevant subset)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` | Cognito app client for this app (GitHub Actions variable) |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Generic runtime name for the Cognito client ID — set in `.env.local` for local dev |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Shared Cognito user pool ID |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Hosted UI domain |
| `NEXT_PUBLIC_RUNTIME_PROFILE` | `mock` (default; local development) or `live` (deployed environments). Determines defaults for auth, data, AI, and future concerns. See root `CLAUDE.md` for the design map. |
| `NEXT_PUBLIC_API_BASE_URL` | Platform API base URL |
| `NEXT_PUBLIC_PLATFORM_WSS_URL` | Platform WebSocket URL for async AI job notifications — extracted from `TransformotionDev-PlatformWs` CloudFormation output at deploy time |

**Cognito client variable rebind:** The GitHub Actions variable `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` is mapped to the generic runtime env var `NEXT_PUBLIC_COGNITO_CLIENT_ID` in the deploy workflow's env block. This allows each app to have its own Cognito App Client (established in sub-phase 7b.5-alpha) while the runtime code (`@transformotion/auth-client`) reads a single generic name. Local development reads `NEXT_PUBLIC_COGNITO_CLIENT_ID` directly from `.env.local`.

## Known constraints

- `eslint-plugin-boundaries` enforces no cross-app imports — do not import from `apps/budget-tracker/`.

## Deploy isolation (M7)

M7 deploy-isolation work is complete as of PRs #346, #348, #350, #351. This app has its own CDK entrypoint (`infrastructure/bin/stock-analyser.ts`) and deploy workflow (`deploy-stock-analyser.yml`). Changes to `apps/stock-analyser/**` trigger only this workflow — no cascade, no cross-app deploys.
