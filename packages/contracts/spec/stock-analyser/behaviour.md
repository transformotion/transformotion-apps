# Stock Analyser Behaviour Contract

## Runtime Boundary

Stock Analyser owns its REST API, WSS API, app Lambdas, portfolio/watchlist
tables, analysis cache, job-results table, AI proxy, and deploy lifecycle.
Platform does not own Stock Analyser runtime behavior.

## REST And Cache Behaviour

Routes are represented in `api.ts`. Protected routes require the shared auth
claim contract plus Stock Analyser app entitlement and account access.

Portfolio updates preserve existing immutable share/cost behavior. Watchlist
updates replace the account watchlist with the provided items.

Analysis cache entries use `AnalysisCacheEntry` and
`WriteAnalysisCacheRequest`. Shared market/cache keys may use shared partitions
only where the backend data contract allows it.

### Cached quotes (M21)

`GET /market/cached-quotes` returns `{ quotes: CachedQuote[] }`, one latest
quote per ticker (`{ ticker, price, dayChangePct, asOf }`) for the SA Home
dashboard. Implementation constraint:

- The handler queries the **SHARED** partition with `SK begins_with
  MARKET-DATA#` and emits the latest point per ticker. It is **read-only**: it
  MUST NOT trigger a provider fetch or a warm — it only enumerates what the
  background warm jobs have already cached.
- An empty cache yields an **empty array** — a valid, supported state (a
  never-warmed dashboard), never an error.
- Auth: `requireAccountData` (marked `auth: 'account'` in `api.ts`).
- The owner spec named the path `/api/stock/v1/market/cached-quotes`; it is
  normalised in the contract to the bare `/market/cached-quotes` to match the
  SA route convention (siblings `/portfolio`, `/watchlist`, `/price/ohlcv`).

### Cache Freshness Badges

Cache status badges are derived, never decorative. `cache-freshness.ts` is the
canonical source: a single TTL-relative rule applies across all Stock Analyser
surfaces (Market, Recommendations, Analyser, ETFs, Metals).

Freshness is a function of the fraction of TTL elapsed
(`(now - cachedAt) / (expiresAt - cachedAt)`), classified against the
**app-level** `StockAnalyserCacheFreshnessPolicy`:

- `fresh`: elapsed ratio `< freshUntilElapsedRatio`
- `recent`: `>= freshUntilElapsedRatio` and `< staleFromElapsedRatio`
- `stale`: `>= staleFromElapsedRatio` and `<= 1`
- `outdated`: past expiry (`> 1`), only when `showOutdatedState` is true;
  otherwise past-expiry data falls back to `stale`

Default policy (`DEFAULT_CACHE_FRESHNESS_POLICY`): `freshUntilElapsedRatio`
`0.25`, `staleFromElapsedRatio` `0.75`, `showOutdatedState` `true`.

Policy validation (`isValidCacheFreshnessPolicy`): `freshUntilElapsedRatio >= 0`,
`staleFromElapsedRatio <= 1`, `freshUntilElapsedRatio < staleFromElapsedRatio`,
and a minimum gap of `MIN_FRESHNESS_RATIO_GAP` (`0.05`). Invalid policies fall
back to defaults via `resolveCacheFreshnessPolicy` in mocks/UI; runtime MUST
reject invalid *persisted* policy updates.

This policy is **app-level configuration, not a per-user preference**, and it is
**display/classification only**: changing it affects which badge a given cache
age renders as — it does NOT change cache expiry, cache writes, background
refresh, or the DynamoDB TTL. The thresholds are configuration, but the visible
labels (`fresh`/`recent`/`stale`/`outdated`) and relative-age text remain fixed
product copy and are never configurable.

`deriveCacheFreshness`/`deriveCacheStatus` accept an optional policy argument and
use `DEFAULT_CACHE_FRESHNESS_POLICY` when it is omitted.

#### Admin configuration and presets

The active policy is persisted app-scoped in a `CacheFreshnessConfigRecord`
(`pk: 'SETTINGS'`, `sk: 'CACHE_FRESHNESS#stock-analyser'`) alongside an editable
**preset library** (`CacheFreshnessPreset[]`). This mirrors the AI runtime
config record: app-owned, admin-edited, and separate from per-user display
settings.

- Built-in presets (`DEFAULT_CACHE_FRESHNESS_PRESETS`): `Conservative`
  (`0.15 / 0.5`), `Balanced` (`0.25 / 0.75`, == default), `Aggressive`
  (`0.5 / 0.9`). Built-ins can be applied/edited but not deleted; `reset`
  restores the defaults.
- Admins apply a preset to the active policy, edit its thresholds via the
  dual-thumb ratio slider + outdated toggle, save the current policy as a new
  preset, rename, or delete custom presets.
- Endpoints: `GET /cache-freshness` and `PUT /cache-freshness`. Authorization is
  **site-admin OR stock-app-admin**; the route is marked `auth: 'account'` as the
  coarse contract marker and runtime enforces the admin rule. Runtime MUST
  validate with `isValidCacheFreshnessPolicy` / `isValidCacheFreshnessPreset` and
  reject invalid payloads.
- In v0 the record is served by `stockAnalyserCacheFreshnessMockHandlers` (an
  in-memory server exposing `subscribe`/`getVersion`); the Settings tab gates the
  editor behind `useStockAnalyserAdmin` and surfaces render badges from the live
  active policy via `useCacheFreshnessPolicy`.

Current TTLs (`STOCK_ANALYSER_CACHE_TTL_SECONDS`, canonical, unchanged by the
policy): Market/Recommendations/Analyser 24h, Metals 2h, ETFs 48h.

Rendering rules:

- `lastUpdated`/`cacheAge` are computed from `cachedAt` via `formatLastUpdated`/
  `formatRelativeAge` (e.g. `Updated 8 minutes ago`). Canned strings are not
  permitted.
- When a result was just generated live and no cache entry exists yet, the
  surface renders `fresh` / `Updated just now` (chosen over hiding the badge so
  status is always present and consistent). See `deriveCacheStatus`.
- `outdated` is only reached when serving past-expiry data. It remains a valid,
  derivable state but does not appear in normal tab examples.

In v0, cache metadata is mocked against a fixed demo clock
(`MOCK_CACHE_NOW_SECONDS`) via `mockCacheSnapshot`/`mockCacheSnapshots` so the
derived badges are deterministic. Runtime supplies real `cachedAt`/`expiresAt`/
`now`.

## AI Behaviour

`/api/claude` is the current app-owned AI proxy route. The provider/model is
resolved by the app proxy from Launchpad AI runtime config, then environment
fallback. JSON fence stripping and response normalization are service-layer
concerns in runtime code, not React hook concerns.

## Mock Behaviour

Mocks in `mocks.ts` must preserve app-owned route semantics and WSS result
messages. Mock AI acknowledgements and results must satisfy the same contracts
as live async responses.
