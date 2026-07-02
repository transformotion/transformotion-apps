# Stock Analyser Current-State Contract Surfaces

> M15 #135 correction note: this is raw post-M9 migration input from the
> runtime repo. It is not the final #136 scope-first structure and it is not
> executable #137/#139 contract material.

## Runtime Sources Inspected

- `apps/stock-analyser/infrastructure/stock-analyser-api-stack.ts`
- `apps/stock-analyser/infrastructure/stock-analyser-tables-stack.ts`
- `apps/stock-analyser/infrastructure/sa-ws-stack.ts`
- `apps/stock-analyser/functions/*/src/index.ts`
- `apps/stock-analyser/lib/api/index.ts`
- `apps/stock-analyser/lib/config/index.ts`
- `apps/stock-analyser/lib/hooks/*`
- `apps/stock-analyser/lib/services/*`
- `apps/stock-analyser/components/stock-analyser/*`
- `contracts/stock-analyser/DATA_CONTRACTS.md`
- `apps/stock-analyser/docs/claude-ai-pattern.md`

## Ownership Baseline

Stock Analyser owns:

- REST API.
- WebSocket API.
- AI proxy runtime.
- portfolio table.
- watchlist table.
- analysis-cache table.
- job-results table.
- frontend static app and deploy workflow.

It consumes LaunchpadAuth-issued Cognito tokens and does not depend on Platform
for app runtime execution.

## Frontend Runtime Config Surfaces

Environment/config inputs:

- `NEXT_PUBLIC_API_URL`: Stock Analyser REST API base URL.
- `NEXT_PUBLIC_SA_WSS_URL`: Stock Analyser WebSocket URL.
- `NEXT_PUBLIC_AI_API_URL` or `NEXT_PUBLIC_CLAUDE_API_URL`: AI proxy URL
  compatibility input.
- `NEXT_PUBLIC_AI_MODEL`: frontend model label, default `claude-3-sonnet`.
- `NEXT_PUBLIC_RUNTIME_PROFILE`: `mock` or `live`.
- `NEXT_PUBLIC_AUTH_OVERRIDE`: auth provider override.
- `NEXT_PUBLIC_AI_OVERRIDE`: AI provider override.
- `NEXT_PUBLIC_DATA_OVERRIDE`: storage provider override.
- `NEXT_PUBLIC_LOG_PROVIDER`, `NEXT_PUBLIC_LOG_LEVEL`.
- Cognito frontend env: `NEXT_PUBLIC_COGNITO_USER_POOL_ID`,
  `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_REGION`.
- cross-app URLs: `NEXT_PUBLIC_SIGNIN_URL`, `NEXT_PUBLIC_SIGNOUT_URL`,
  `NEXT_PUBLIC_BUDGET_URL`.

Provider defaults:

- auth: mock profile -> `mock`, live profile -> `cognito`.
- AI: mock profile -> `mock`, live profile -> `claude`.
- data: mock profile -> `local`, live profile -> `dynamo`.

## REST API Surfaces

Base URL:

- `Transformotion{Stage}-StockAnalyserApi` output `ApiUrl`.

Protected routes use Cognito authorizer and runtime middleware:

- require `apps` claim to include `stock-analyser`, unless `site_admin`.
- require account access in `accounts.stock-analyser`.
- use `X-Account-Id` for account resolution.

Routes:

| Method | Path | Current purpose |
| --- | --- | --- |
| `GET` | `/portfolio` | list account portfolio holdings |
| `PUT` | `/portfolio` | replace account portfolio holdings |
| `GET` | `/watchlist` | list account watchlist items |
| `PUT` | `/watchlist` | replace account watchlist items |
| `GET` | `/analysis-cache/{key}` | read cache or async job result |
| `PUT` | `/analysis-cache/{key}` | write cache entry |
| `DELETE` | `/analysis-cache/{key}` | delete cache entry |
| `GET` | `/cycle/ohlcv?ticker=` | compute/load cycle data |
| `GET` | `/price/ohlcv?ticker=&range=&interval=` | fetch/load OHLCV data |
| `POST` | `/api/claude` | start AI proxy request, including async mode |

## Data Table Surfaces

Tables:

- `stock-analyser.portfolio-{stage}`: PK `accountId`, SK `ticker`.
- `stock-analyser.watchlist-{stage}`: PK `accountId`, SK `ticker`.
- `stock-analyser.analysis-cache-{stage}`: PK `accountId`, SK `cacheKey`,
  TTL `expiresAt`.
- `stock-analyser.job-results-{stage}`: PK `accountId`, SK `cacheKey`,
  TTL `expiresAt`.
- `stock-analyser.ws-connections-{stage}`: PK `connectionId`, TTL `expiresAt`,
  GSI `userId-index`.

The analysis-cache handler uses `SHARED` as a partition for globally reusable
analysis and market data cache entries. `job-*` keys are read from the
job-results table using the active account partition.

## Portfolio Surfaces

Current holding shape:

```ts
interface PortfolioHolding {
  ticker: string;
  shares: number;
  avgCost: number;
  isGifted: boolean;
  addedAt: number;
}
```

`PUT /portfolio` accepts `{ holdings: PortfolioHolding[] }` and returns
`{ ok: true }`.

Current behaviour:

- existing `shares` are immutable.
- existing non-gifted non-zero `avgCost` is immutable.
- omitted existing tickers are deleted.
- incoming holdings are stored under the active account.

## Watchlist Surfaces

Current watchlist item shape:

```ts
interface WatchlistItem {
  ticker: string;
  name: string;
  addedAt: number;
  addedPrice?: number;
}
```

`PUT /watchlist` accepts `{ items: WatchlistItem[] }` and returns
`{ ok: true }`.

Current behaviour:

- omitted existing tickers are deleted.
- incoming items are stored under the active account.

## Analysis Cache And Job Result Surfaces

Cache request body:

```ts
{
  data: unknown;
  ttlSeconds: number;
  mode?: string;
  type?: string;
  shared?: boolean;
}
```

Cache response normalizes current and legacy formats to:

```ts
{
  data: unknown;
  cachedAt: number;
  expiresAt: number;
  dataType?: string;
  mode?: string;
}
```

Shared cache prefixes:

- `MARKET`
- `ETFS`
- `RECS`
- `METALS`
- `ANALYSIS`
- `CYCLE`

Known AI/UI cache keys from current tabs:

- `MARKET#${geography}`
- `RECS#${market}`
- `ETF#${market}` in current UI; older doc says `ETFS#${category}`.
- `METALS`
- `ANALYSIS#${ticker}`
- `OHLCV#${ticker}`
- `MARKET-DATA#${ticker}#${range}#${interval}`

#136/#137 should reconcile the inconsistent ETF/METALS key naming before
making executable contracts.

## Market / Cycle / Price Data Surfaces

`GET /cycle/ohlcv`:

- query: `ticker` required.
- checks computed cycle cache at `OHLCV#${ticker}`.
- checks raw market cache at `MARKET-DATA#${ticker}#1y#1d`.
- fetches Yahoo Finance if needed.
- returns cycle fields plus `source: "cache" | "live"`.

`GET /price/ohlcv`:

- query: `ticker` required.
- query defaults: `range=1y`, `interval=1d`.
- valid ranges: `1mo`, `3mo`, `6mo`, `1y`, `5y`, `max`.
- valid intervals: `1d`, `1wk`, `1mo`.
- returns OHLCV arrays and `source: "cache" | "live"`.

## AI Proxy Surfaces

Current frontend start call:

```ts
POST /api/claude
{
  prompt: string;
  systemPrompt?: string;
  webSearch?: boolean;
  maxTokens?: number;
  asyncMode: true;
  connectionId?: string;
  appName?: "stock-analyser";
}
```

Current async acknowledgement:

```ts
{ jobId: string }
```

The app-owned AI proxy is created through `@transformotion/fn-claude-proxy-core`
with:

- permitted app: `stock-analyser`.
- app-owned job-results table.
- app-owned WebSocket management endpoint.
- Anthropic secret `${stage}/anthropic/api-key`.

Known current response handling:

- JSON fence stripping and response cleanup still exist in runtime service/hook
  material and must be moved into final service/helper contracts during
  #136/#137 if still current.
- #368 target architecture may already have changed some hook/service details;
  #136 should verify against the latest runtime source before conversion.

## WebSocket Surfaces

WebSocket URL:

- `Transformotion{Stage}-StockAnalyserWs` output `WssUrl`.
- frontend env `NEXT_PUBLIC_SA_WSS_URL`.

Connection query parameters:

- `token`: Cognito JWT.
- `accountId`: optional account id.
- `app`: defaults to `stock-analyser` and must equal `stock-analyser`.

Authorizer behaviour:

- verifies JWT against LaunchpadAuth issuer/JWKS.
- denies missing token.
- denies wrong `app`.
- denies requested `accountId` not present in `accounts.stock-analyser`.
- authorizer context includes `userId`, `accountId`, and `app`.

`$connect` behaviour:

- stores `connectionId`, `userId`, `accountId`, `app`, `createdAt`,
  `expiresAt` in `stock-analyser.ws-connections-{stage}`.

`$default` behaviour:

- parses optional body.
- if `{ "action": "init" }`, sends `{ type: "connected", connectionId }`
  back to the connection.

`$disconnect` behaviour:

- deletes the connection row by `connectionId`.

AI completion messages are sent by the AI proxy through the app-owned WSS
management endpoint. The exact pushed message shape must be captured during
#137/#139 from `fn-claude-proxy-core`.

## Frontend Navigation / State Surfaces

Current Stock Analyser tabs:

- `market`
- `recs`
- `etfs`
- `metals`
- `analyser`
- `portfolio`
- `watchlist`

Navigation state includes:

- active tab.
- sector filter and originating tab.
- analyser ticker and originating tab.
- watchlist entries.
- portfolio ticker list.
- user/account display state.
- explanatory-text global setting and per-tab overrides.
- tab result cache.

Actions include:

- tab navigation.
- navigate to recommendations with sector.
- navigate to analyser with ticker/source.
- add/remove watchlist item.
- account switch.
- sign out.
- return to Launchpad.
- explanatory text toggles.
- tab cache get/set.

## Known Gaps In Previously Migrated `DATA_CONTRACTS.md`

The existing `DATA_CONTRACTS.md` does not fully cover:

- Stock Analyser REST route list and auth requirements.
- WSS authorizer/connect/default/disconnect contracts.
- app-owned AI proxy and async job result behaviour.
- app-owned table ownership after M9.
- runtime profile/env/provider resolution.
- market/cycle/price data endpoints.
- current app shell navigation/account/auth surfaces.
- cache key inconsistencies between docs and current UI.
