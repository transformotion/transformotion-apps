# Stock Analyser Navigation Contract

Stock Analyser tab state is represented by `StockAnalyserTab` and
`StockAnalyserFrontendState` in `types.ts`.

Tabs:

- `market`
- `recs`
- `etfs`
- `metals`
- `analyser`
- `portfolio`
- `watchlist`

The UI must preserve account selection, selected ticker, originating tab,
watchlist entries, portfolio ticker list, and explanatory text state.

Auth/session data comes from Launchpad-issued claims. A user without
`stock-analyser` entitlement must not reach live Stock Analyser data flows.

## Region vs Universe

Stock Analyser models two separate concepts (see `types.ts`):

- `AnalysisRegion` (`global` | `australia` | `us` | `uk`) is the geography the
  **Market Analysis** surface analyses. It is geography/provenance only and is
  **never** consumed as a search universe.
- `RecommendationUniverse` (`ASX` | `NASDAQ` | `Dow` | `FTSE`) is the
  exchange/index universe the **Recommendations** surface searches.

A region maps to one or more supported universes via
`REGION_TO_RECOMMENDATION_UNIVERSES`. Each Market Analysis sector result
(`MarketAnalysisSectorResult`) carries a structured `recommendationUniverse`
resolved within its `sourceRegion`, plus the raw `bestExchange` string.

## Market Analysis -> Recommendations

Navigating from a Market Analysis sector card into Recommendations carries a
`RecommendationsNavigationPayload`:

- `sector`
- `recommendationUniverse` — a `RecommendationUniverse`, never an
  `AnalysisRegion`
- `sourceRegion` — the originating region, for breadcrumb/provenance only

Rules:

- Recommendations consumes `RecommendationUniverse`; it must not receive or
  interpret geography.
- A market-originated navigation with a missing or invalid universe MUST NOT
  silently fall back to `ASX`. The Recommendations surface must surface a
  recoverable state and require an explicit universe selection.
- Direct entry to Recommendations (not market-originated) may keep its existing
  default universe if designed that way.

## Default Search Mode

`StockAnalyserSettings.defaultSearchMode` (`live` | `fast`, default `live`) is
the canonical app default for the per-search Fast/Live toggle. Each search
surface seeds its per-search toggle from this default and may override it per
search without mutating the default. It is updated via
`PATCH /settings` (`PatchSettingsRequest.defaultSearchMode`).
