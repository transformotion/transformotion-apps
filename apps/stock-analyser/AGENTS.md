# Stock Analyser - AI Agent operating guide

This file is the authoritative Stock Analyser agent guide. The sibling `CLAUDE.md` file is a Claude Code compatibility mirror and must remain semantically equivalent. Any instruction added, removed, or modified here must be reflected in `CLAUDE.md` in the same PR.

Read this file before any Stock Analyser work. Read the root `AGENTS.md` for branching strategy, architecture governance, and operating mode.

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
| `Transformotion{Stage}-StockAnalyserTables` | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}`, `stock-analyser.analysis-cache-{stage}`, `stock-analyser.job-results-{stage}` |
| `Transformotion{Stage}-StockAnalyserWs` | Stock Analyser-owned WebSocket API, WS Lambdas, and `stock-analyser.ws-connections-{stage}` |
| `Transformotion{Stage}-StockAnalyserApi` | Stock Analyser-owned REST API Gateway, app Lambdas, and `stock-analyser-ai-proxy-{stage}` |

Source: `apps/stock-analyser/infrastructure/`

## Lambda functions

Current state after #366/#386: Stock Analyser owns its REST API Gateway, AI proxy runtime, WSS completion path, and job-results table. Authentication is issued by LaunchpadAuth. Platform REST/WSS/Claude runtime remains deployed only as decommission debt.

| Lambda | Source | Routes |
|---|---|---|
| `transformotion-portfolio-{stage}` | `apps/stock-analyser/functions/portfolio` | `GET/PUT /portfolio` |
| `transformotion-watchlist-{stage}` | `apps/stock-analyser/functions/watchlist` | `GET/PUT /watchlist` |
| `transformotion-analysis-cache-{stage}` | `apps/stock-analyser/functions/analysis-cache` | `GET/PUT/DELETE /analysis-cache/{key}` |
| `stock-analyser-ai-proxy-{stage}` | `apps/stock-analyser/functions/ai-proxy` | `POST /api/claude` |
| `transformotion-cycle-check-{stage}` | `apps/stock-analyser/functions/cycle-check` | EventBridge scheduled (no HTTP route) |
| `transformotion-cycle-data-{stage}` | `apps/stock-analyser/functions/cycle-data` | `GET /cycle/ohlcv?ticker=` |
| `transformotion-market-data-{stage}` | `apps/stock-analyser/functions/market-data` | `GET /price/ohlcv?ticker=&range=&interval=` |

## DynamoDB tables

| Table | PK | SK | Purpose |
|---|---|---|---|
| `stock-analyser.portfolio-{stage}` | `accountId` | `ticker` | Portfolio holdings per account |
| `stock-analyser.watchlist-{stage}` | `accountId` | `ticker` | Watchlist items per account |
| `stock-analyser.analysis-cache-{stage}` | `accountId` | `cacheKey` | AI analysis cache (TTL: expiresAt) |
| `stock-analyser.job-results-{stage}` | `accountId` | `cacheKey` | Async AI job state (TTL: expiresAt) |

Analysis cache is accessed by `transformotion-analysis-cache-{stage}` (read/delete). Async job records (`job-*` keys) are written by `stock-analyser-ai-proxy-{stage}` to `stock-analyser.job-results-{stage}`. The `analysis-cache` Lambda routes GET requests for `job-*` keys to that app-owned table; all other keys stay on `stock-analyser.analysis-cache-{stage}`.

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

### AI service pattern

Stock Analyser AI uses a thin React hook over a service-owned execution layer:

```text
React UI
  -> useClaude<T>() / callClaudeAPI<T>()
    -> getAIService().call<T>()
      -> ClaudeAIService or MockAIService
      -> cache, WSS transport, response parsing, fixtures
```

`useClaude<T>()` in `lib/hooks/use-claude.ts` owns React state only: loading,
error, abort orchestration, and the existing UI-facing API. AI execution lives
under `lib/services/ai/`.

`ClaudeAIService` handles the live async request cycle via Stock Analyser-owned runtime:
1. Open SA WSS (`NEXT_PUBLIC_SA_WSS_URL`) with Cognito ID token and `?app=stock-analyser`
2. Send `{ action: 'init' }` → receive `{ type: 'connected', connectionId }`
3. POST to `/api/claude` with prompt + `connectionId` → returns `jobId`
4. Receive `{ type: 'job_complete' }` push on the WebSocket when the job finishes
5. Read result from `/analysis-cache/job-{jobId}`, strip optional JSON code fences, parse JSON, and return the typed result

Cache reads/writes are service-layer behavior via `lib/services/ai/cache.ts`,
not hook behavior. See `apps/stock-analyser/docs/claude-ai-pattern.md` for usage
examples and configuration.

### Adding a new AI feature

Stock Analyser AI goes through `useClaude<T>()` for React components or
`callClaudeAPI<T>()` from `lib/services/ai` for non-React service callers.

1. Add mock fixture data to `lib/services/ai/fixtures/index.ts` (keyword-keyed, returned by `getMockResponse()`)
2. The `MockAIService` at `lib/services/ai/mock-ai.ts` uses `getMockResponse()`; no change needed unless the interface changes
3. `ClaudeAIService` at `lib/services/ai/claude-ai.ts` owns live WSS/API execution; no hook import is allowed from the service layer
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
| Computed Cycle Position | `OHLCV#{ticker}` | 1h |
| Raw OHLCV (shared) | `MARKET-DATA#{ticker}#{range}#{interval}` | 8h |

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
| `NEXT_PUBLIC_RUNTIME_PROFILE` | `mock` (default; local development) or `live` (deployed environments). Determines defaults for auth, data, AI, and future concerns. See root `AGENTS.md` for the design map. |
| `NEXT_PUBLIC_API_URL` | Stock Analyser-owned API Gateway URL from `Transformotion{Stage}-StockAnalyserApi` |
| `NEXT_PUBLIC_SA_WSS_URL` | Stock Analyser-owned WebSocket URL from `Transformotion{Stage}-StockAnalyserWs`; live AI WSS endpoint after #366 |

Server-side AI proxy env includes `AI_CONFIG_TABLE`, `AI_FALLBACK_PROVIDER`,
`AI_FALLBACK_MODEL`, `ANTHROPIC_SECRET_NAME`, and `OPENAI_SECRET_NAME` for
runtime provider/model resolution and provider execution. The config table is
Launchpad-owned control-plane state; provider secrets and execution remain
Stock Analyser-owned runtime concerns.

**Cognito client variable rebind:** The GitHub Actions variable `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` is mapped to the generic runtime env var `NEXT_PUBLIC_COGNITO_CLIENT_ID` in the deploy workflow's env block. This allows each app to have its own Cognito App Client (established in sub-phase 7b.5-alpha) while the runtime code (`@transformotion/auth-client`) reads a single generic name. Local development reads `NEXT_PUBLIC_COGNITO_CLIENT_ID` directly from `.env.local`.

## Known constraints

- `eslint-plugin-boundaries` enforces no cross-app imports — do not import from `apps/budget-tracker/`.

## Deploy isolation (M7)

M7 deploy-isolation work is complete as of PRs #346, #348, #350, #351. This app has its own CDK entrypoint (`infrastructure/bin/stock-analyser.ts`) and deploy workflow (`deploy-stock-analyser.yml`). Changes to `apps/stock-analyser/**` trigger only this workflow — no cascade, no cross-app deploys.
