# Stock Analyser - Claude Code compatibility mirror

`apps/stock-analyser/AGENTS.md` is the authoritative Stock Analyser agent guide.
This file is maintained for Claude Code compatibility and must remain
semantically equivalent. Any instruction added, removed, or modified in
`AGENTS.md` must be reflected here in the same PR.

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
| Stock Analyser API contracts and types | Authored in `transformotion-apps-b8/contracts/stock-analyser/`; consumed here from generated read-only [/v0-reference/contracts/stock-analyser/](/v0-reference/contracts/stock-analyser/) |
| Migration invariants from HTML version | [apps/stock-analyser/MIGRATION_INVARIANTS.md](./MIGRATION_INVARIANTS.md) |

## CDK stacks owned

| Stack | Contents |
|---|---|
| `Transformotion{Stage}-StockAnalyserTables` | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}`, `stock-analyser.analysis-cache-{stage}`, `stock-analyser.job-results-{stage}`, `stock-analyser.settings-{stage}`, `stock-analyser.notification-state-{stage}`, `stock-analyser.notification-send-log-{stage}` |
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
| `stock-analyser-settings-{stage}` | `apps/stock-analyser/functions/settings` | `GET/PATCH /settings`, `GET /ai-config`, `PUT/DELETE /ai-config/override`, `GET/PUT /cache-freshness`, `GET/PUT /notification-config`, `GET/PUT /notification-consent`, `GET/PUT /notification-engine-config` (#571 kill-switch; PUT site/app-admin) |
| `stock-analyser-ai-proxy-{stage}` | `apps/stock-analyser/functions/ai-proxy` | `POST /api/claude` |
| `stock-analyser-recommendations-{stage}` | `apps/stock-analyser/functions/recommendations` | `POST /recommendations/run` (M19 #592 async two-stage engine: propose candidates → real OHLCV price → rank WITH price → structured `pick`/`watch`/`avoid`. Self-invokes for the async executor; writes `job-*` results + pushes `job_complete` over WSS — the thin-UI reads it via the shared WSS/cache path) |
| `stock-analyser-notification-engine-{stage}` | `apps/stock-analyser/functions/notification-engine` | EventBridge scheduled (daily, no HTTP route). Warms the market-wide cache `MARKET#{region}` (#584) AND runs notification transitions/sends — both gated by the #571 kill-switch |
| `stock-analyser-notification-history-{stage}` | `apps/stock-analyser/functions/notification-history` | `GET /notification-history` (#573 run-history; server-scoped per viewer) |
| `transformotion-cycle-check-{stage}` | `apps/stock-analyser/functions/cycle-check` | EventBridge scheduled (no HTTP route) |
| `transformotion-cycle-data-{stage}` | `apps/stock-analyser/functions/cycle-data` | `GET /cycle/ohlcv?ticker=` |
| `transformotion-market-data-{stage}` | `apps/stock-analyser/functions/market-data` | `GET /price/ohlcv?ticker=&range=&interval=`; plus a service-principal `get-ohlcv` invoke branch for the notification engine's #535 grounding (#584) |

## DynamoDB tables

| Table | PK | SK | Purpose |
|---|---|---|---|
| `stock-analyser.portfolio-{stage}` | `accountId` | `ticker` | Portfolio holdings per account |
| `stock-analyser.watchlist-{stage}` | `accountId` | `ticker` | Watchlist items per account |
| `stock-analyser.analysis-cache-{stage}` | `accountId` | `cacheKey` | AI analysis cache (TTL: expiresAt) |
| `stock-analyser.job-results-{stage}` | `accountId` | `cacheKey` | Async AI job state (TTL: expiresAt) |
| `stock-analyser.settings-{stage}` | `pk` | `sk` | Account/user settings, app-wide cache freshness policy, and notification preferences/consent |
| `stock-analyser.notification-state-{stage}` | `accountId` | `sk` | Durable notification transition state (no TTL) |
| `stock-analyser.notification-send-log-{stage}` | `pk` | `sk` | M19 #572 notification run/send audit log (run summary + per-account + embedded member outcomes); GSI1 recency, GSI2 per-account; TTL `expiresAt` (90d) |

Analysis cache is accessed by `transformotion-analysis-cache-{stage}` (read/delete). Async job records (`job-*` keys) are written by `stock-analyser-ai-proxy-{stage}` to `stock-analyser.job-results-{stage}`. The `analysis-cache` Lambda routes GET requests for `job-*` keys to that app-owned table; all other keys stay on `stock-analyser.analysis-cache-{stage}`.

## Authorization requirement

All Lambda handlers use helpers from `packages/lambda-middleware`. App-data routes use the **data-authority factory** `requireAccountData` (D9, M16); supervisory/ownership routes use `requireAccountAdmin`:

```typescript
const saData = requireAccountData('stock-analyser');             // module scope

saData.read(auth, accountId);                                    // read tier — claims only, viewer passes
await saData.write(auth, accountId, membershipLoader);          // write tier — claims + live members row, viewer denied
requireAccountAdmin(/* owner / manager / supervisory guards */); // supervisory & ownership ops
requireSiteAdmin(auth);                                          // platform admin ops only
```

Construct `requireAccountData('stock-analyser')` at module scope, then call `.read` on GET branches and `.write` (with a `dynamoMembershipLoader`) before each mutation. There is **no site-admin data bypass** — membership is the only grant of data authority. Per-user rows within an account (settings preferences, D12) use `.read` for the owner's own writes. `requireAccountAccess` and `requireAccountOwner` were **deleted** in M16 Phase 5. Do not call `requireGroup` directly. See [auth.md](/docs/architecture/auth.md) and [route-classification-m16.md](/docs/architecture/route-classification-m16.md).

## Service layer and data contracts

The app uses a service-adaptor pattern: components call service methods → service handles mock vs real internally. Components never check provider flags directly.

Contracted service/API shapes are authored in the v0 repo first and consumed
here from `v0-reference/contracts/stock-analyser/`. Do not edit the synced
runtime copy directly; follow the root M15 contract authoring rule.

Key service methods currently covered by the Stock Analyser contract set:
- `portfolioService.getHoldings()` / `saveHoldings()` / `enrichHoldings()`
- `watchlistService.getItems()` / `saveItems()`
- `useClaude()` hook — POST to `/api/claude` + async polling pattern

### Claude AI pattern

The `useClaude<T>()` hook handles the full async request cycle via Stock Analyser-owned runtime:
1. Open SA WSS (`NEXT_PUBLIC_SA_WSS_URL`) with Cognito ID token and `?app=stock-analyser`
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

### Structured output (schema-constrained JSON)

JSON-returning AI surfaces should pass a `responseSchema` (the v0 canonical
schema from `@transformotion/contracts/stock-analyser/structured-output`) to
`provider.generate` so the model is **constrained** to valid schema-matching JSON
instead of prompt-and-parse. The provider abstraction is provider-agnostic at the
call site; each `fn-ai-proxy-core` provider applies its own mechanism (OpenAI
`response_format` json_schema strict; Anthropic forced tool-use, **two-pass** in
Live/web-search mode). Tolerant `JSON.parse(stripCodeFences(...))` + the
#589/#597 non-JSON instrumentation remain as a **logged backstop**. Conform to
`contracts/stock-analyser/structured-output.behaviour.md`. The engine hot path
(market warm + per-ticker analysis) passes the schema directly; the interactive
Analyser and Market tabs send a small `surface` string (`analyser` | `market`)
and the AI proxy resolves it **server-side** to the canonical schema (via the
app-supplied `structuredOutputSchemas` registry), keeping the schema off the
wire. Recs is deferred to the #592 backend-engine contract.

**Live two-pass technical grounding (#602).** The analyser schema requires
COMPUTED technicals (RSI, MACD, cyclePosition, volumeTrend, …) that web search
cannot ground — they are computed from price history, not published facts. In
Live (web-search two-pass) mode the research pass would otherwise hard-fail the
integrity guard or fabricate technicals that contradict the app's own cycle
gauge and the other provider. So Live analyser calls **supply the real
`computeCyclePosition` output** as a SUPPLIED-DATA block
(`lib/analysis/stock-analysis-grounding.ts` `buildTickerSuppliedData` — the
per-ticker analogue of Market's `buildSectorSuppliedData`): the interactive tab
fetches `/cycle/ohlcv` and supplies it pre-call; the engine's per-ticker
analysis computes it server-side. Web search still supplies the qualitative
facts; computation supplies the technicals, so both providers emit identical,
gauge-matching values. If OHLCV is genuinely absent (`computeCyclePosition`
returns null for < 30 bars), NO block is supplied and the model degrades
honestly (insufficient-data, never fabricated).

**Live MARKET grounding rubric + degrade (#601/market).** The Live two-pass
`DATA_STATUS` availability check is REGION-appropriate for the `market` surface,
not ticker-centric. `provider.generate` takes a `groundingKind` (`security`
default | `market`); the AI proxy resolves `surface` → `groundingKind`
server-side via the app-supplied `structuredOutputGroundingKinds` registry
(`{ market: 'market' }` — the same server-side pattern as
`structuredOutputSchemas`), and the notification-engine warm job passes
`groundingKind: 'market'` directly. So the interactive Market tab and the warm
`MARKET#{region}` cache share ONE grounding path and cannot diverge. Under the
market rubric, Pass 1 assesses macro conditions (rates/inflation/growth) + a
per-sector read (`buildSectorSuppliedData` supplies real sector-proxy OHLCV as
authoritative), NOT tradable-instrument/price/RSI — applying the ticker rubric
to a region wrongly declared UNAVAILABLE and hard-failed (the bug). If market
grounding is still unavailable, the provider DEGRADES to a structured Fast pass
over the supplied sector data instead of throwing 502 — Market Live grounds when
it can, returns a structured result when it can't, never hard-errors. The #601
hard-fail guard is PRESERVED for `security` grounding: an ungroundable ticker
has no supplied fallback, so degrading there would fabricate analysis of a
non-verifiable instrument (exactly what the guard exists to prevent). Both market
call sites pass `MARKET_ANALYSIS_MAX_TOKENS` (12000) — the Pass-1 grounded
research must cover region macro AND every mapped sector, and at the 4000
provider default that research truncated for content-heavy regions (US macro
dropped to "Grounded research incomplete", sectors fell back to bare proxy
returns). A `console.warn` `ai_market_grounding_degraded` event marks when the
market degrade path fires, so a fallback is visible in CloudWatch.

| Data | Cache key format | TTL |
|---|---|---|
| Market Analysis | `MARKET#{geography}` | 24h |
| Recommendations | `RECS#{universe}#{mode}#{sector?}` | 24h |
| ETFs | `ETF#{market}` | 48h |
| Metals | `METALS` | 2h |
| Stock Analysis | `ANALYSIS#{ticker}` | 24h |
| Portfolio enrichment | `ANALYSIS#{ticker}` | 24h |
| Watchlist enrichment | `ANALYSIS#{ticker}` | 24h |
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

**Cognito client variable rebind:** The GitHub Actions variable `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` is mapped to the generic runtime env var `NEXT_PUBLIC_COGNITO_CLIENT_ID` in the deploy workflow's env block. This allows each app to have its own Cognito App Client (established in sub-phase 7b.5-alpha) while the runtime code (`@transformotion/auth-client`) reads a single generic name. Local development reads `NEXT_PUBLIC_COGNITO_CLIENT_ID` directly from `.env.local`.

## Known constraints

- `eslint-plugin-boundaries` enforces no cross-app imports — do not import from `apps/budget-tracker/`.

## Deploy isolation (M7)

M7 deploy-isolation work is complete as of PRs #346, #348, #350, #351. This app has its own CDK entrypoint (`infrastructure/bin/stock-analyser.ts`) and deploy workflow (`deploy-stock-analyser.yml`). Changes to `apps/stock-analyser/**` trigger only this workflow — no cascade, no cross-app deploys.
