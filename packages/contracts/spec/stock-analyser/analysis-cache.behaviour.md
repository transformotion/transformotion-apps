# Analysis cache & Run/Re-run behaviour (unified across AI tabs)

> Behaviour-only companion to `cache-freshness.ts` and `types.ts`
> (`AnalysisCacheEntry`). The TypeScript contracts are the authority for shapes;
> this file describes the cache-first Run / Re-run / Refresh interaction shared
> by every AI-backed Stock Analyser tab.

## Scope

Applies to the five AI tabs: **Market Analysis**, **Recommendations**, **ETFs**,
**Metals**, and the single-ticker **Analyser**. Portfolio and Watchlist render
derived account data with no AI call and are unaffected.

The shared client implementation is `hooks/use-scoped-analysis.ts`, backed by the
app-shell `analysisCache` (scope-keyed) and the contract freshness helpers.

## Scope-keyed cache

Each result is cached under `analysisCacheKey(surface, scopeKey)` →
`"{surface}:{scopeKey}"`, where `scopeKey` is the tab's selected query
dimension(s):

| Surface    | Scope dimension(s)          | Example key                 |
| ---------- | --------------------------- | --------------------------- |
| `market`   | region                      | `market:australia`          |
| `etfs`     | market                      | `etfs:US`                   |
| `analyser` | ticker                      | `analyser:BHP.AX`           |
| `recs`     | universe + mode (+ sector)  | `recs:ASX\|Top Picks`       |
| `metals`   | none (constant)             | `metals:default`            |

Because the scope is part of the key, switching scope (e.g. ASX → US) never
clobbers another scope's entry, and the displayed data always matches the
selector. The cached value is a full `AnalysisCacheEntry` (`data`, `cachedAt`,
`expiresAt`, optional `mode`), so freshness badge and result derive from one
entry — they can never disagree.

## On load / on scope change → idle

The tab does **not** auto-render cached data. On first load, and whenever the
scope changes, the tab returns to an **idle** state showing **`Run Analysis`**
(the user has not yet asked for analysis). Pressing the button is what surfaces
data. (Exception: arriving at Recommendations from a Market Analysis sector card
is itself an explicit analyse request, so it auto-runs once for that scope.)

## `Run Analysis` / `Re-run Analysis` — cache-first

Both are the same cache-first action; only the label differs by whether the
current scope already has a result:

1. Read the cache entry for the current scope.
2. If an entry exists **and is not past its TTL** (`isCacheExpired` is false),
   serve it — **no fetch**.
3. Otherwise (missing **or** expired) perform a fetch and write the result back
   to the cache for that scope.

After a result is shown for the scope, the button reads **`Re-run Analysis`** and
behaves identically (cache-first). Changing scope reverts to idle / `Run
Analysis`.

> Cache-read cutoff = **past TTL only**. A non-expired entry is always served by
> Run/Re-run regardless of its display freshness band (`fresh`/`recent`/`stale`).
> The freshness bands remain a display concern for the badge.

## `Refresh` — the only force-live

The existing `CacheStatusBar` **Refresh** action is the **only** way to bypass
the cache read. It always fetches and writes the result back to cache for the
current scope, regardless of whether a valid entry exists.

## Live / Fast toggle

The per-tab Live/Fast toggle (seeded from the app `defaultSearchMode`) decides
**what a fetch does** — it does not change the cache-first rule above:

- **Live** → `callClaude({ webSearch: true })`: live market/web call.
- **Fast** → `callClaude({ webSearch: false })`: the model answers from training
  data; **no live market call**.

This applies to both the fetch branch of Run/Re-run (cache miss or expired) and
to Refresh. So `Refresh` while on **Fast** performs a training-data refresh, not
a live web call — Fast never makes a live market call.

## Reset semantics

`analysisCache` is seeded from `mockScopedAnalysisCacheSeed` and is reset to that
seed on **account switch**, so no user-fetched scope leaks across accounts.

## Mock / demo notes

- All freshness is computed against the fixed `MOCK_CACHE_NOW_SECONDS` demo
  clock; freshly-written entries read as `fresh` / "just now".
- The seed ships two Market scopes to exercise both read branches:
  `market:australia` is **fresh** (served without a fetch) and `market:us` is
  **expired** (an entry exists but Run fetches anyway). All other scopes start as
  cache misses.
